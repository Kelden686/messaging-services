import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from 'database';
import { RegisterSchema, LoginSchema, VerifyOtpSchema } from 'shared';
import { config } from '../config';
import { cacheService } from '../services/redis.service';

const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 mins
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '15m' });
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId }, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { email, password, name, avatar } = parseResult.data;

    // Check if user already exists in DB
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Cache OTP and registration details (valid for 10 minutes)
    await cacheService.set(`otp:${email}`, otp, 600);
    await cacheService.set(
      `reg:${email}`,
      JSON.stringify({ email, passwordHash, name, avatar }),
      600
    );

    // Output OTP to console for local testing
    console.log(`\n==========================================`);
    console.log(`🔑 OTP Verification for ${email}`);
    console.log(`Code: ${otp}`);
    console.log(`==========================================\n`);

    res.status(200).json({
      message: 'Verification OTP sent to email (simulated in console)',
      email,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = VerifyOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { email, code } = parseResult.data;

    // Verify OTP
    const cachedOtp = await cacheService.get(`otp:${email}`);
    if (!cachedOtp || cachedOtp !== code) {
      res.status(400).json({ error: 'Invalid or expired OTP verification code' });
      return;
    }

    // Retrieve registration details
    const regDataStr = await cacheService.get(`reg:${email}`);
    if (!regDataStr) {
      res.status(400).json({ error: 'Registration session expired. Please sign up again.' });
      return;
    }

    const { passwordHash, name, avatar } = JSON.parse(regDataStr);

    // Create User in DB
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        phone: true,
        publicKey: true,
        isOnline: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    // Clean up cache
    await cacheService.delete(`otp:${email}`);
    await cacheService.delete(`reg:${email}`);

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Store session in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    // Set cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    res.status(201).json({
      message: 'Account verified and created successfully',
      user,
      refreshToken,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Save session in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    // Set Cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    const { passwordHash, ...userWithoutPassword } = user;

    res.status(200).json({
      message: 'Logged in successfully',
      user: userWithoutPassword,
      refreshToken,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    // Check DB for session
    const session = await prisma.session.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(session.userId);
    const newRefreshToken = generateRefreshToken(session.userId);

    // Update session in DB
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    
    await prisma.$transaction([
      prisma.session.delete({ where: { id: session.id } }),
      prisma.session.create({
        data: {
          userId: session.userId,
          token: newRefreshToken,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    // Set Cookie
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    res.status(200).json({
      refreshToken: newRefreshToken,
      accessToken: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];
    
    if (refreshToken && typeof refreshToken === 'string') {
      await prisma.session.deleteMany({ where: { token: refreshToken } });
    }

    res.clearCookie('accessToken');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};
