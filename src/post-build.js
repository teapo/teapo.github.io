var fs = require('fs');
var Inline = require("inline");


fs.createReadStream('teapo.html').pipe(
  new Inline("teapo.html", {
    //default options:
    images: true, //inline images
    scripts: true, //inline scripts
    stylesheets: true //inline stylesheets
  }, function(err, data){
    if(err) throw err;
    var text = data+'';
    text = text.replace(/undefined>/g, 'style>');
    require("fs").writeFileSync("../index.html", text);
  }
));