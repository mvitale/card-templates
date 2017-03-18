(function() {
  var exports = {};

  if (typeof module === "undefined") {
    window.TemplateRenderer = exports;
  } else {
    module.exports = exports;
  }

  var templateSupplier = null
    , canvasSupplier = null
    , imageFetcher = null
    , card = null
    , template = null
    , canvas = null;

  exports.setTemplateSupplier = function(supplier) {
    templateSupplier = supplier;
  }

  exports.setCanvasSupplier = function(supplier) {
    canvasSupplier = supplier;
  }

  exports.setImageFetcher = function(fetcher) {
    imageFetcher = fetcher;
  }

  exports.setCard = function setCard(theCard, cb) {
    card = theCard;

    if (!template || card.templateName !== template.name) {
      templateSupplier.supply(card.templateName, function(err, theTemplate) {
        if (err) return cb(err);
        template = theTemplate;
        canvas = canvasSupplier.supply(template.width, template.height);

        return cb();
      });
    } else {
      return cb();
    }
  }

  function imageFields() {
    return fields().filter((field) => {
      return field["type"] === "image";
    });
  }
  exports.imageFields = imageFields;

  function fields() {
    var ret = []
      , fieldIds = Object.keys(template.fields)
      , fields = template.fields
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

  function editableFields() {
    return fields().filter(function(field) {
      return field.label != null;
    });
  }
  exports.editableFields = editableFields;

  function getCanvas() {
    return canvas;
  }
  exports.getCanvas = getCanvas;

  function resolveImage(fieldData, cb) {
    if (!fieldData.image) {
      if (fieldData.url) {
        return imageFetcher.fetch(fieldData.url, function(err, image) {
          if (err) return cb(err);

          delete fieldData.url;
          fieldData.image = image;

          return cb(null, fieldData);
        });
      } else {
        console.log(fieldData);
        return cb(new Error("Unable to resolve image"));
      }
    }

    return cb(null, fieldData);
  }

  function resolveImagesHelper(fieldDataStack, cb) {
    if (fieldDataStack.length === 0) {
      return cb();
    }

    resolveImage(fieldDataStack.pop(), function(err, data) {
      if (err) return cb(err);

      return resolveImagesHelper(fieldDataStack, cb);
    });
  }

  function resolveImages(fieldData, cb) {
    resolveImagesHelper(fieldData.slice(0), cb);
  }

  function buildDrawingDataHelper(fields, choices, drawingData, cb) {
    if (fields.length === 0) {
      return cb(null, drawingData);
    }

    var field = fields.pop()
      , fieldValue = field.value
      , fieldChoices = choices[field.id]
      , dataValue = card.data[field.id]
      , defaultSpec = card.defaultData[field.id]
      , dataSrc = null
      , chosenValue = null;

    // != null is true for undefined as well (don't use !==)
    if (fieldValue != null) {
      dataSrc = fieldValue
    } else if (dataValue != null) {
      dataSrc = dataValue;
    } else if (defaultSpec != null) {
      dataSrc = defaultSpec;
    }

    if (dataSrc != null) {
      if (dataSrc.value != null) {
        chosenValue = dataSrc.value;
      } else if (dataSrc.choiceIndex != null) {
        if (typeof dataSrc.choiceIndex === "number") {
          chosenValue = fieldChoices[dataSrc.choiceIndex];
        } else if (typeof dataSrc.choiceIndex === "object") { // Assume array of indices
          chosenValue = [];

          dataSrc.choiceIndex.forEach(function(index) {
            chosenValue.push(fieldChoices[index]);
          });
        }
      }
    }

    drawingData[field.id] = chosenValue;

    if (field.type === "image") {
      return resolveImage(chosenValue, function(err, fieldData) {
        if (err) return cb(err);

        return buildDrawingDataHelper(fields, choices, drawingData, cb);
      });
    } else if (field.type === "multi-image") {
      return resolveImages(chosenValue, function(err, fieldData) {
        if (err) return cb(err);

        return buildDrawingDataHelper(fields, choices, drawingData, cb);
      })
    } else {
      return buildDrawingDataHelper(fields, choices, drawingData, cb);
    }
  }

  function buildDrawingData(fields, choices, cb) {
    return buildDrawingDataHelper(fields, choices, {}, cb);
  }

  function draw(cb) {
    var fields = exports.fields();

    buildDrawingData(fields.slice(0), card.choices, function(err, drawingData) {
      if (err) return cb(err);

      var ctx = canvas.getContext('2d')
        , fieldData = null;

      fields.forEach(function(field) {
        fieldData = drawingData[field.id];
        drawField(ctx, field, fieldData);
      });

      return cb(null, canvas);
    });
  }
  exports.draw = draw;

  function drawField(ctx, field, fieldData) {
    switch(field.type) {
      case "color":
        drawColor(ctx, field, fieldData);
        break;
      case "line":
        drawLine(ctx, field, fieldData);
      case "text":
        drawText(ctx, field, fieldData);
        break;
      case "key-val-text":
        drawKeyValText(ctx, field, fieldData);
        break;
      case "image":
        drawImage(ctx, field, fieldData);
        break;
      case "multi-image":
        drawMultiImage(ctx, field, fieldData);
        break;
      case "var-list":
        drawVarList(ctx, field, fieldData);
        break;
      default:
        // TODO: Handle this case
    }
  }

  function drawVarList(ctx, field, data) {
    var curData = null
      , curField = null
      , yOffset = 0
      , fields = field.fields
      , fieldKeys = Object.keys(fields)
      ;


    for (var i = 0; i < data.length; i++) {
      curData = data[i];
      yOffset = field.yIncr * i;

      fieldKeys.forEach((fieldKey) => {
        var curField = Object.assign({}, fields[fieldKey]);

        switch (curField.type) {
          case "line":
            curField.startY += field.y + yOffset;
            curField.endY += field.y + yOffset;
            break;
          default:
            curField.y += field.y + yOffset;
        }

        drawField(ctx, curField, curData[fieldKey]);
      });
    }
  }

  function drawColor(ctx, field, data) {
    ctx.fillStyle = data;
    ctx.fillRect(field.x, field.y, field.width, field.height);
  }

  function drawKeyValText(ctx, field, data) {
    var keyFont = field.keyFont ? field.keyFont : field.font
      , valFont = field.valFont ? field.valFont : field.font;

    drawTextHelper(ctx, field.keyFont, field.color, data.key, field.keyX, field.y);
    drawTextHelper(ctx, field.valFont, field.color, data.val, field.valX, field.y);
  }

  function drawText(ctx, field, data) {
    drawTextHelper(ctx, field.font, field.color, data, field.x, field.y,
      field.wrapAt, field.textAlign);
  }

  function drawTextHelper(ctx, font, color, value, x, y, wrapAt, textAlign) {
    var fontSizeLineHeightMultiplier = 1.12
      , words = null
      , width = null
      , lineX = x
      , curY = y
      , curWord = null
      , curText = null
      , newLine = false;

    ctx.font = font;
    ctx.fillStyle = color;

    // TODO: Allow wrapping for text alignments other than default left
    if (wrapAt == null) {
      if (textAlign != null) {
        if (textAlign === 'center') {
          x = x - ctx.measureText(value, x, y).width / 2;
        } else if (textAlign === 'right') {
          x = x - ctx.measureText(value, x, y).width;
        }
        // left is implicit - nothing to do
      }

      ctx.fillText(value, x, y);
    } else {
      wordStack = value.split(' ').reverse();

      if (wordStack.length === 0) {
        return;
      }

      curWord = wordStack.pop();
      ctx.fillText(curWord, x, y);
      lineX += ctx.measureText(curWord, x, y).width;

      while (wordStack.length > 0) {
        curWord = wordStack.pop();
        curText = ' ' + curWord;
        newX = ctx.measureText(curText).width + lineX;

        if (newX <= wrapAt) {
          ctx.fillText(curText, lineX, curY);
          lineX = newX;
        } else {
          curY += fontSizePx(ctx) * fontSizeLineHeightMultiplier;
          ctx.fillText(curWord, x, curY);
          lineX = ctx.measureText(curWord).width + x;
        }
      }
    }
  }

  // Get current font size in pixels from canvas context
  function fontSizePx(ctx) {
    var fontArgs = ctx.font.split(' ');
    return parseFloat(fontArgs[0].replace('px', ''));
  }

  function drawMultiImage(ctx, field, data) {
    var specs = field.specs[data.length - 1]
      , curData = null
      , curSpec = null;

    for (var i=0; i < data.length; i++) {
      curData = data[i];
      curSpec = specs[i];

      drawImageHelper(ctx, curSpec, curData);
    }
  }

  function drawImageHelper(ctx, field, data) {
    var targetRatio = (field.width * 1.0) / field.height
      , imageHeight = typeof(data.image.naturalHeight) === "undefined" ?
          data.image.height :
          data.image.naturalHeight
      , imageWidth = typeof(data.image.naturalWidth) === "undefined" ?
          data.image.width :
          data.image.naturalWidth
      , imageRatio = (imageWidth * 1.0) / imageHeight
      , sx = 0
      , sy = 0
      , sWidth = 0
      , sHeight = 0
      , gap = 0;

    if (data.sx != null && data.sy != null && data.sWidth != null) {
      sx = data.sx;
      sy = data.sy;
      sWidth = data.sWidth;
      sHeight = sWidth * targetRatio;
    } else {
      if (imageRatio <= targetRatio) {
        sWidth = imageWidth;
        sHeight = sWidth / targetRatio;

        gap = imageHeight - sHeight;
        sy = gap / 2.0;
      } else {
        sHeight = imageHeight;
        sWidth = targetRatio * sHeight;

        gap = imageWidth - sWidth;
        sx = gap / 2.0;
      }
    }

    ctx.drawImage(
      data.image,
      sx,
      sy,
      sWidth,
      sHeight,
      field.x,
      field.y,
      field.width,
      field.height
    );
  }

  function drawImage(ctx, field, data) {
    drawImageHelper(ctx, field, data);

    if (field.credit) {
      drawText(ctx, field.credit, data.credit);
    }
  }

  function drawLine(ctx, field, data) {
    ctx.strokeStyle = field.color;
    ctx.lineWidth = field.width;

    ctx.beginPath();
    ctx.moveTo(field.startX, field.startY);
    ctx.lineTo(field.endX, field.endY);
    ctx.stroke();
  }
})();
