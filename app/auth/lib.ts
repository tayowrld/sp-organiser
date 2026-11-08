import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

type UserPayload = { id: number }

function signingKey() {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error('Задайте JWT_SECRET длиной не менее 32 символов')
  return new TextEncoder().encode(process.env.JWT_SECRET || 'sp-development-only-key')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createToken(user: UserPayload): Promise<string> {
  return new SignJWT({ id: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(signingKey())
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { clockTolerance: 60 })
    return payload as unknown as UserPayload
  } catch {
    return null
  }
}
