var args = process.argv.slice(2);
var releaseVersion = args[0];

if (typeof releaseVersion === 'undefined') {
  console.log('Release version is undefined, please specify a version `node run.js 0.10.3`');
  process.exit(9);
}

var Builder = require('./' + releaseVersion + '/index.js').Builder;
var builder = Builder.$new();

console.log('Running benchmark on ' + releaseVersion);
var LOOP=100;
var EXEC=20;
for (i = 1; i < EXEC; i++) {
  console.time("opal-builder");
  for (j = 1; j < LOOP; j++) {
    var result = builder.$build('hello.rb');
  }
  console.timeEnd("opal-builder");
}
