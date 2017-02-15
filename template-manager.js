(function() {
  var exports = {};

  if (typeof module === "undefined") {
    window.TemplateManager = exports;
  } else {
    module.exports = exports;
  }

  var templateData = null;
  var reader = null;
  var canvasSupplier = null;

  exports.setTemplateReader = function(templateReader) {
    reader = templateReader;
  }

  exports.setCanvasSupplier = function(supplier) {
    canvasSupplier = supplier;
  }

  exports.loadTemplate = function loadTemplate(name, cb) {
    reader.read(name, (err, data) => {
      if (err) return cb(err);

      templateData = data;
      return cb();
    });
  }

  exports.imageFields = function imageFields() {
    return fields().filter((field) => {
      return field["type"] === "image";
    });
  }

  function fields() {
    // Make a defensive copy
    var copy = []
      , fields = templateData["fields"]
      , curField = null;

    for (var i = 0; i < fields.length; i++) {
      curField = fields[i];
      copy.push(Object.assign({}, curField));
    }

    return copy;
  }
  exports.fields = fields;

  exports.draw = function draw(content) {
    var canvas = canvasSupplier.supply(templateData['width'], templateData['height'])
      , ctx = canvas.getContext('2d')
      , fields = templateData['fields']
      , field = null
      , fieldData = null;

    for (var i = 0; i < fields.length; i++) {
      field = fields[i];
      fieldData = content[field['id']];

      if (fieldData) {
        switch(field['type']) {
          case "color":
            drawColor(ctx, field, fieldData);
            break;
          case "text":
            drawText(ctx, field, fieldData);
            break;
          case "image":
            drawImage(ctx, field, fieldData);
            break;
          default:
            // TODO: Handle this case
        }
      }
    }

    return canvas;
  }

  function drawColor(ctx, field, data) {
    ctx.fillStyle = data;
    ctx.fillRect(field['x'], field['y'], field['width'], field['height']);
  }

  function drawText(ctx, field, data) {
    ctx.font = field['font'];
    ctx.fillStyle = field['color'];
    ctx.fillText(data, field['x'], field['y']);
  }

  function drawImage(ctx, field, data) {
    var heightWidthRatio = (field['height'] * 1.0) / field['width'];

    ctx.drawImage(
      data['image'],
      data['sx'],
      data['sy'],
      data['sWidth'],
      heightWidthRatio * data['sWidth'],
      field['x'],
      field['y'],
      field['width'],
      field['height']
    );
  }
})();
