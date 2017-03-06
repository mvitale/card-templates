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
  }

  // Do DFS on defaultSpec and resolve any $choiceIndex-{n} values by replacing
  // with fieldChoices[n]
  function resolveDefault(defaultSpec, fieldChoices) {
    var choiceIndexPrefix = "$choiceIndex-"
      , choiceIndexStartIndex = choiceIndexPrefix.length
      , defaultSpecCopy = null
      , keyStack = null
      , parentStack = []
      , curKey = null
      , curVal = null
      , parent = null
      , choiceIndex = null
      , parentRecord = null
      , keys = null;

    if (typeof defaultSpec === "string" && defaultSpec.startsWith(choiceIndexPrefix)) {
      return fieldChoices[parseInt(defaultSpec.substring(choiceIndexStartIndex))];
    } else if (typeof defaultSpec === "object" && !Array.isArray(defaultSpec)) {
      defaultSpecCopy = JSON.parse(JSON.stringify(defaultSpec));
      curVal = defaultSpecCopy
      keys = Object.keys(defaultSpecCopy);
      keyStack = keys;
      parentStack.push({node: defaultSpecCopy, numKeys: keys.length});

      while (keyStack.length > 0) {
        curKey = keyStack.pop();

        parentRecord = parentStack.pop();

        if (parentRecord.numKeys === 0) {
          parentRecord = parentStack.pop();
        }

        parentRecord.numKeys -= 1;
        parentStack.push(parentRecord);

        parent = parentRecord.node;

        curVal = parent[curKey];
        if (typeof curVal === "object" && !Array.isArray(curVal)) {
          keys = Object.keys(curVal);
          keyStack = keyStack.concat(keys);
          parentStack.push({node: curVal, numKeys: keys.length})
        } else if (typeof curVal === "string" && curVal.startsWith(choiceIndexPrefix)) {
          choiceIndex = parseInt(curVal.substring(choiceIndexStartIndex));
          parent[curKey] = fieldChoices[choiceIndex];
        }
      }

      return defaultSpecCopy;
    } else {
      return defaultSpec;
    }
  }

  function buildDrawingDataHelper(fields, choices, drawingData, cb) {
    if (fields.length === 0) {
      return cb(null, drawingData);
    }

    var field = fields.pop()
      , fieldValue = card.data[field.id]
      , defaultSpec = card.defaultData[field.id]
      , chosenValue = null;

    // != null is true for undefined as well (don't use !==)
    if (fieldValue != null) {
      chosenValue = fieldValue;
    } else if (defaultSpec != null) {
      chosenValue = resolveDefault(defaultSpec, choices[field.id]);
    } else {
      return cb(new Error("No value or default provided for field " + field.id));
    }

    drawingData[field.id] = chosenValue;

    if (field.type === "image") {
      return resolveImage(chosenValue, (err, fieldData) => {
        if (err) return cb(err);

        return buildDrawingDataHelper(fields, choices, drawingData, cb);
      });
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

        switch(field.type) {
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
      });

      return cb(null, canvas);
    });
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
    var targetRatio = (field.width * 1.0) / field.height
      , heightWidthRatio = (field.height * 1.0) / field.width
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
      sHeight = sWidth * heightWidthRatio;
    } else {
      if (imageRatio <= targetRatio) {
        sWidth = imageWidth;
        sHeight = sWidth / targetRatio;

        gap = field.height - sHeight;
        sy = gap / 2;
      } else {
        sHeight = imageHeight;
        sWidth = targetRatio * sHeight;

        gap = imageWidth - sWidth;
        sx = gap / 2;
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
})();
