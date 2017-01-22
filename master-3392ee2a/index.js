require('./opal.js');
require('./nodejs.js');
require('./pathname.js');
require('./base64.js');
require('./opal-builder.js');

Opal.require('nodejs');
Opal.require('opal-builder');

module.exports.Builder = ((Opal.get('Opal')).$$scope.get('Builder'));
