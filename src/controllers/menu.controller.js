const { MenuItem, Vendor } = require('../models');

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Fetches the authenticated vendor's profile. Returns null if none exists. */
const getVendorProfile = (userId) =>
  Vendor.findOne({ where: { user_id: userId } });

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/menu
 * Protected — vendor only.
 * Adds a new item to the authenticated vendor's menu.
 */
exports.addMenuItem = async (req, res) => {
  try {
    const vendor = await getVendorProfile(req.user.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found. Please create one before adding menu items.',
      });
    }

    const { name, description, price, is_available } = req.body;

    if (!name || price === undefined || price === null) {
      return res.status(400).json({
        success: false,
        message: 'Please provide item name and price.',
      });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a non-negative number.',
      });
    }

    const item = await MenuItem.create({
      vendor_id:    vendor.id,
      name:         name.trim(),
      description:  description ? description.trim() : null,
      price:        parsedPrice.toFixed(2),
      is_available: is_available !== undefined ? Boolean(is_available) : true,
    });

    res.status(201).json({ success: true, message: 'Menu item added.', item });
  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: error.errors.map((e) => e.message).join(' | '),
      });
    }
    console.error('[MENU] addMenuItem error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/menu/vendor/:vendorId
 * Public.
 * Returns the menu for a given vendor.
 * By default only available items are returned.
 * Pass ?all=true for the vendor's own full view (including unavailable items).
 */
exports.getVendorMenu = async (req, res) => {
  try {
    const where = { vendor_id: req.params.vendorId };
    if (req.query.all !== 'true') where.is_available = true;

    const items = await MenuItem.findAll({
      where,
      order: [['name', 'ASC']],
    });

    res.status(200).json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('[MENU] getVendorMenu error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/menu/:id
 * Protected — vendor only.
 * Updates a menu item. Ownership is verified before any change is applied.
 */
exports.updateMenuItem = async (req, res) => {
  try {
    const vendor = await getVendorProfile(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    }

    const item = await MenuItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Menu item not found.' });
    }

    // Ownership guard — vendors may only edit their own items
    if (item.vendor_id !== vendor.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this menu item.',
      });
    }

    const { name, description, price, is_available } = req.body;

    if (price !== undefined) {
      const parsed = parseFloat(price);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ success: false, message: 'Price must be a non-negative number.' });
      }
    }

    await item.update({
      name:         name         ? name.trim()                      : item.name,
      description:  description  !== undefined ? description.trim() : item.description,
      price:        price        !== undefined ? parseFloat(price).toFixed(2) : item.price,
      is_available: is_available !== undefined ? Boolean(is_available) : item.is_available,
    });

    res.status(200).json({ success: true, message: 'Menu item updated.', item });
  } catch (error) {
    console.error('[MENU] updateMenuItem error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PATCH /api/menu/:id/toggle
 * Protected — vendor only.
 * Flips a menu item's availability between available and unavailable.
 */
exports.toggleItemAvailability = async (req, res) => {
  try {
    const vendor = await getVendorProfile(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    }

    const item = await MenuItem.findByPk(req.params.id);
    if (!item)                        return res.status(404).json({ success: false, message: 'Menu item not found.' });
    if (item.vendor_id !== vendor.id) return res.status(403).json({ success: false, message: 'Forbidden. You do not own this menu item.' });

    const newStatus = !item.is_available;
    await item.update({ is_available: newStatus });

    res.status(200).json({
      success:      true,
      message:      `"${item.name}" is now ${newStatus ? 'AVAILABLE' : 'UNAVAILABLE'}.`,
      is_available: newStatus,
    });
  } catch (error) {
    console.error('[MENU] toggleItemAvailability error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * DELETE /api/menu/:id
 * Protected — vendor only.
 * Permanently deletes a menu item after verifying ownership.
 */
exports.deleteMenuItem = async (req, res) => {
  try {
    const vendor = await getVendorProfile(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    }

    const item = await MenuItem.findByPk(req.params.id);
    if (!item)                        return res.status(404).json({ success: false, message: 'Menu item not found.' });
    if (item.vendor_id !== vendor.id) return res.status(403).json({ success: false, message: 'Forbidden. You do not own this menu item.' });

    const itemName = item.name;
    await item.destroy();

    res.status(200).json({ success: true, message: `"${itemName}" has been deleted.` });
  } catch (error) {
    console.error('[MENU] deleteMenuItem error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
