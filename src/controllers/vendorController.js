const User = require('../models/User');
const Event = require('../models/Event');

exports.getVendorProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vendor = await User.findOne({ _id: id, role: 'vendor' }).select(
      'vendorProfile email phoneNumber'
    );

    if (!vendor) {
      return res.status(404).json({
        status: 'fail',
        message: 'No vendor found with that ID'
      });
    }

    const events = await Event.find({ vendor: id });

    res.status(200).json({
      status: 'success',
      data: {
        vendor,
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};
