import { config } from '../config.js';
import { COOKIE_NAME } from '../middlewares/index.js';
import * as authService from '../services/auth.service.js';
import { usersRepo } from '../repositories/users.repo.js';
import { notFound } from '../lib/errors.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  domain: config.cookieDomain,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
});

function sendSession(res, user, status = 200) {
  const token = authService.signToken(user.id);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  // El token también va en el body para clientes que no usan cookies (tests, Postman).
  res.status(status).json({ user, token });
}

export const authController = {
  register: async (req, res) => sendSession(res, await authService.register(req.app.locals.db, req.body), 201),
  login: async (req, res) => sendSession(res, await authService.login(req.app.locals.db, req.body)),
  logout: async (_req, res) => {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  },
  me: async (req, res) => {
    const user = await usersRepo.findById(req.app.locals.db, req.userId);
    if (!user) throw notFound('Usuario');
    res.json({ user });
  },
};
