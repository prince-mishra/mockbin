'use strict'

var debug = require('debug-log')('mockbin')

module.exports = function (req, res, next) {
  this.client.get('wsbin:' + req.params.uuid, function (err, value) {
    if (err) {
      debug(err)

      throw err
    }

    if (value) {
      var har = JSON.parse(value)

      res.view = 'wsbin/view'
      res.body = har
    }

    next()
  })
}
