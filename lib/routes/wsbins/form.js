'use strict'

module.exports = function (req, res, next) {
  res.view = 'wsbin/create'

  next()
}
