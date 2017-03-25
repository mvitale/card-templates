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
    , canvas = null
    ;

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
    return editableFields().filter((field) => {
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

  function mergeDrawingData(choiceVal, customVal) {
    var merged = choiceVal;

    if (customVal != null) {
      if (typeof customVal === "object") {
        if (merged === null) {
          merged = {};
        }

        // This isn't necessarily a safe assumption - TODO: add error handling
        Object.assign(merged, customVal);
      } else {
        merged = customVal;
      }
    }

    return merged;
  }

  function resolveChoice(choiceIndex, fieldChoices) {
    var chosenValue = null;

    if (typeof choiceIndex === "number") {
      chosenValue = fieldChoices[choiceIndex];
    } else if (Array.isArray(choiceIndex)) { // Assume array of indices
      chosenValue = [];

      choiceIndex.forEach(function(index) {
       chosenValue.push(fieldChoices[index]);
      });
    }

    return chosenValue;
  }

  function resolveColor(colorSchemes, value) {
    var schemeName = null
      , schemeField = null
      , parts = null
      ;

    if (value.startsWith('$')) {
      parts = value.substring(1).split('.');
      schemeName = parts[0];
      schemeField = parts[1];

      value = colorSchemes[schemeName][schemeField];
    }

    return value;
  }

  function buildDrawingDataHelper(colorSchemes, fields, choices, drawingData, cb) {
    if (fields.length === 0) {
      return cb(null, drawingData);
    }

    var cardCopy = JSON.parse(JSON.stringify(card))
      , field = fields.pop()
      , fieldValue = field.value
      , fieldChoices = choices[field.id]
      , dataValue = cardCopy.data[field.id]
      , defaultSpec = cardCopy.defaultData[field.id]
      , dataSrc = null
      , chosenValue = null;

    // != null is true for undefined as well (don't use !==)
    if (dataValue != null) {
      dataSrc = dataValue;
    } else if (fieldValue != null) {
      dataSrc = field
    } else if (defaultSpec != null) {
      dataSrc = defaultSpec;
    }

    if (dataSrc != null) {
      if (dataSrc.choiceIndex != null) {
        chosenValue = resolveChoice(dataSrc.choiceIndex, fieldChoices);
      }

      // TODO: validate
      if (chosenValue != null) {
        if (dataSrc.value != null) {
          if (Array.isArray(dataSrc.value)) {
            for (var i = 0; i < dataSrc.value.length; i++) {
              chosenValue[i] = mergeDrawingData(chosenValue[i], dataSrc.value[i]);
            }
          } else {
            chosenValue = mergeDrawingData(chosenValue, dataSrc.value);
          }
        }
      } else {
        chosenValue = dataSrc.value;
      }
    }

    if (field.type === "color") {
      chosenValue = resolveColor(colorSchemes, chosenValue);
    }

    drawingData[field.id] = chosenValue;

    if (field.type === 'text') {
      resolveTextColor(chosenValue, field, colorSchemes);
    } else if (field.type === 'image' || field.type === 'labeled-choice-image') {
      return resolveImage(chosenValue, function(err, fieldData) {
        if (err) return cb(err);

        return buildDrawingDataHelper(colorSchemes, fields, choices, drawingData, cb);
      });
    } else if (field.type === 'multi-image') {
      return resolveImages(chosenValue, function(err, fieldData) {
        if (err) return cb(err);

        return buildDrawingDataHelper(colorSchemes, fields, choices, drawingData, cb);
      });
    }

    return buildDrawingDataHelper(colorSchemes, fields, choices, drawingData, cb);
  }

  function resolveTextColor(data, field, colorSchemes) {
    if (data == null) return;

    var color = data.color != null ? data.color : field.color;
    color = resolveColor(colorSchemes, color);
    data.color = color;
  }

  function buildDrawingData(fields, choices, cb) {
    var colorSchemes = []
      , otherFields = []
      ;

    fields.forEach(function(field) {
      if (field.type === "color-scheme") {
        colorSchemes.push(field);
      } else {
        otherFields.push(field);
      }
    });


    // TODO: refactor
    buildDrawingDataHelper(null, colorSchemes, choices, {}, function(err, schemes) {
      return buildDrawingDataHelper(schemes, otherFields, choices, {}, cb);
    });
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

  function fieldRequiresData(field) {
    return field.type !== 'line';
  }

  function drawField(ctx, field, fieldData) {
    if (fieldRequiresData && fieldData == null) {
      return;
    }

    switch(field.type) {
      case 'color':
        drawColor(ctx, field, fieldData);
        break;
      case 'line':
        drawLine(ctx, field, fieldData);
      case 'text':
        drawText(ctx, field, fieldData);
        break;
      case 'key-val-text':
        drawKeyValText(ctx, field, fieldData);
        break;
      case 'image':
      case 'labeled-choice-image':
        drawImage(ctx, field, fieldData);
        break;
      case 'multi-image':
        drawMultiImage(ctx, field, fieldData);
        break;
      case 'var-list':
        drawVarList(ctx, field, fieldData);
        break;
      case 'key-val-list':
        drawKeyValList(ctx, field, fieldData);
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

  function drawKeyValList(ctx, field, data) {
    var curData = null
      , curField = null
      , yOffset = 0
      , fields = []
      , additionalElems = field.additionalElements
      , additionalKeys = Object.keys(additionalElems)
      ;

    for (var i = 0; i < data.length; i++) {
      fields.push(Object.assign({type: 'key-val-text'}, field.keyValSpec));

      additionalKeys.forEach(function(key) {
        fields.push(Object.assign({}, additionalElems[key]));
      });

      curData = data[i];
      yOffset = field.yIncr * i;

      fields.forEach(function(curField) {
        switch (curField.type) {
          case "line":
            curField.startY += field.y + yOffset;
            curField.endY += field.y + yOffset;
            break;
          default:
            curField.y += field.y + yOffset;
        }

        drawField(ctx, curField, curData);
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

    drawTextHelper(ctx, field.keyFont, field.color, data.key, null, field.keyX, field.y);
    drawTextHelper(ctx, field.valFont, field.color, data.val, null, field.valX, field.y);
  }

  function drawText(ctx, field, data) {
    drawTextHelper(ctx, field.font, data.color, data.text, field.prefix, field.x, field.y,
      field.wrapAt, field.textAlign);
  }

  function drawTextHelper(ctx, font, color, value, prefix, x, y, wrapAt, textAlign) {
    console.log(value, color);
    var fontSizeLineHeightMultiplier = 1.12
      , words = null
      , width = null
      , lineX = x
      , curY = y
      , curWord = null
      , curText = null
      , newLine = false
      ;

    value = value === null ? '' : value;

    ctx.font = font;
    ctx.fillStyle = color;

    if (prefix) {
      value = prefix + value;
    }

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

    // TODO: integrate into above calculations
    if (data.zoomLevel) {
      sHeight -= data.zoomLevel * sWidth / 100;
      sWidth = targetRatio * sHeight;
    }

    if (data.panX) {
      sx += data.panX * sWidth / 300;
    }

    if (data.panY) {
      sy += data.panY * sHeight / 300;
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

  function defaultSDimensions(field, image) {


    return {
      sWidth: sWidth,
      sHeight: sHeight,
      sx: sx,
      sy: sy
    };
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
