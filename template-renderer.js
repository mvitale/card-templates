(function() {
  var exports = {};

  if (typeof module === "undefined") {
    window.TemplateRenderer = exports;
  } else {
    module.exports = exports;
  }

  var templateData = null;
  var templateSupplier = null;
  var canvasSupplier = null;
  var canvas = null;

  exports.setTemplateSupplier = function(supplier) {
    templateSupplier = supplier;
  }

  exports.setCanvasSupplier = function(supplier) {
    canvasSupplier = supplier;
  }

  exports.loadTemplate = function loadTemplate(name, cb) {
    canvas = null;

    templateSupplier.supply(name, (err, data) => {
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
    var ret = []
      , fieldIds = Object.keys(templateData.fields)
      , fields = templateData.fields
      , fieldId = null
      , field = null;

    for (var i = 0; i < fieldIds.length; i++) {
      fieldId = fieldIds[i];
      field = fields[fieldId];

      ret.push(Object.assign({}, { id: fieldId }, field));
    }

    return ret;
  }
  exports.fields = fields;

  function getCanvas() {
    if (canvas) {
      return canvas;
    }

    if (templateData === null) {
      return null;
    }

    canvas = canvasSupplier.supply(templateData['width'], templateData['height']);
    return canvas;
  }
  exports.getCanvas = getCanvas;

  function draw(content) {
    var canvas = getCanvas()
      , ctx = canvas.getContext('2d')
      , fields = exports.fields() // TODO: Why is prefacing with exports necessary??
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
  exports.draw = draw;

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

    console.log(data.image.naturalWidth);
    console.log('x');
    console.log(data.image.naturalHeight);

    ctx.drawImage(
      data.image,
      data.sx,
      data.sy,
      data.sWidth,
      heightWidthRatio * data.sWidth,
      field.x,
      field.y,
      field.width,
      field.height
    );
  }
})();
