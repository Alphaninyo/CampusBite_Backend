const jwt  = require('jsonwebtoken');
const { User } = require('../models');

/**
 * protect
 * Verifies the JWT sent in the Authorization header and attaches
 * the authenticated user to req.user for downstream handlers.
 *
 * Expected header: Authorization: Bearer <token>
 */
exports.protect = async (req, res, next) => {
  try {
    // 1. Extract token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated. Please log in to access this resource.',
      });
    }

    // 2. Verify signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Confirm the user still exists in the DB
    //    (guards against tokens issued to deleted accounts)
    const currentUser = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash'] },
    });

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'The account associated with this token no longer exists.',
      });
    }

    // 4. Attach user to request and proceed
    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token. Please log in again.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
    }
    console.error('[AUTH MIDDLEWARE] Unexpected error:', error);
    res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

/**
 * restrictTo
 * Role-based access control guard. Call after protect.
 * Usage: router.delete('/users', protect, restrictTo('admin'), handler)
 *
 * @param {...string} roles - Roles that are permitted to access the route.
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This action requires one of the following roles: ${roles.join(', ')}.`,
      });
    }
    next();
  };
};
