/*
 * Renders a Canvas image from a Card. This module functions in both Node.js and
 * browser environments: when used in a Node environment, it behaves as a normal
 * Node module; otherwise, it is globally available as window.TemplateRenderer.
 *
 * This module has several dependencies that must be injected before attempting
 * to render a Card:
 *
 * Template supplier - provide a card template's (specified by name) 'spec'
 * object, which describes all of the fields for a template. Injected by
 * calling setTemplateSupplier.
 *
 * Canvas supplier - takes a width and height in pixels and returns a Canvas
 * instance. Injected by calling setCanvasSupplier.
 *
 * Image fetcher - resolve image URL and supply an Image instance. Injected by
 * setImageFetcher
 *
 * ---------------------------------------------------------------------------
 *
 * After all dependencies have been injected, call setCard to set the card to
 * render, then draw to render the card to a Canvas.
 */
(function() {
  function TemplateRenderer(templateSupplier, canvasSupplier, imageFetcher) {
    var card = null
      , template = null
      , canvas = null
      , that = this
      ;

    /*
     * Inject template supplier dependency
     */
    this.setTemplateSupplier = function(supplier) {
      templateSupplier = supplier;
    }

    /*
     * Inject Canvas supplier dependency
     */
    this.setCanvasSupplier = function(supplier) {
      canvasSupplier = supplier;
    }

    /*
     * Inject image fetcher dependency
     */
    this.setImageFetcher = function(fetcher) {
      imageFetcher = fetcher;
    }

    /*
     * Set the Card to render. This method does not make a copy of the Card, so
     * any external changes it will be reflected here. Calling this method causes
     * the Card's template to be fetched, meaning that the get*Fields methods can
     * be called after this method completes; it also causes the drawing Canvas
     * to be set, which can be accessed by calling the getCanvas method.
     *
     * Parameters:
     *   theCard - the Card
     *   cb - function(err)
     */
    this.setCard = function setCard(theCard, cb) {
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

    /*
     * Get all fields with type 'image' from the Card's template
     */
    function imageFields() {
      return editableFields().filter((field) => {
        return field["type"] === "image";
      });
    }
    this.imageFields = imageFields;

    /*
     * Get all fields from the Card's template
     */
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
    this.fields = fields;

    /*
     * Get all editable fields from the Card's template
     */
    function editableFields() {
      return fields().filter(function(field) {
        return field.label != null;
      });
    }
    this.editableFields = editableFields;

    /*
     * Get the Canvas on which the draw method will render the Card
     */
    function getCanvas() {
      return canvas;
    }
    this.getCanvas = getCanvas;

    function resolveImage(image, url, cb) {
      if (!image) {
        if (url) {
          return imageFetcher.fetch(url, cb);
        } else {
          return cb(new Error('No url provided'));
        }
      }

      return cb(null, image);
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

    function buildColorData(field, data, colorSchemes) {
      var resolvedColor = resolveColor(colorSchemes, data.color);

      return {
        type: 'color',
        x: field.x,
        y: field.y,
        height: field.height,
        width: field.width,
        color: resolvedColor
      };
    }

    function buildLineData(field, colorSchemes) {
      var resolvedColor = resolveColor(colorSchemes, field.color);

      return {
        type: 'line',
        color: resolvedColor,
        startX: field.startX,
        startY: field.startY,
        endX: field.endX,
        endY: field.endY,
        width: field.width
      };
    }

    function buildTextData(field, data, colorSchemes) {
      var text = data == null ? '' : data.text;

      return buildTextDataHelper(
        field.x,
        field.y,
        field.font,
        field.color,
        field.prefix,
        field.wrapAt,
        field.textAlign,
        text,
        colorSchemes
      );
    }

    function buildKeyValTextData(field, data, colorSchemes) {
      return [
        buildTextDataHelper(
          field.keyX,
          field.y,
          field.font,
          field.color,
          field.prefix,
          field.wrapAt,
          field.textAlign,
          data.key.text,
          colorSchemes
        ),
        buildTextDataHelper(
          field.valX,
          field.y,
          field.font,
          field.color,
          field.prefix,
          field.wrapAt,
          field.textAlign,
          data.val.text,
          colorSchemes
        )
      ];
    }

    function buildTextDataHelper(
      x,
      y,
      font,
      color,
      prefix,
      wrapAt,
      textAlign,
      text,
      colorSchemes
    ) {
      var resolvedColor = resolveColor(colorSchemes, color);

      return {
        type: 'text',
        font: font,
        color: resolvedColor,
        text: text,
        prefix: prefix,
        x: x,
        y: y,
        wrapAt: wrapAt,
        textAlign: textAlign
      };
    }

    function buildImageData(field, data, colorSchemes, cb) {
      var results = [];

      if (field.credit) {
        results.push(
          buildTextData(field.credit, data.credit, colorSchemes));
      }

      buildImageDataHelper(field, data, function(err, imageData) {
        if (err) return cb(err);

        results.push(imageData);
        cb(null, results);
      });
    }

    function buildImageDataHelper(field, data, cb) {
      resolveImage(data.image, data.url, function(err, image) {
        if (err) return cb(err);

        var result = {
          type: 'image',
          x: field.x,
          y: field.y,
          height: field.height,
          width: field.width,
          panX: data.panX,
          panY: data.panY,
          zoomLevel: data.zoomLevel,
          image: image
        };

        cb(null, result);
      });
    }

    function buildMultiImageDataHelper(
      fields, datas, colorSchemes, resultsAccum, cb
    ) {
      if (fields.length === 0) {
        return cb(null, resultsAccum);
      }

      var field = fields.pop()
        , data = datas.pop()
        ;

      buildImageDataHelper(field, data, function(err, imageData) {
        if (err) return cb(err);

        resultsAccum.push(imageData);
        buildMultiImageDataHelper(fields, datas, colorSchemes, resultsAccum, cb);
      });
    }

    function buildMultiImageData(field, data, colorSchemes, cb) {
      // TODO: Validate data length etc.

      if (data.length) {
        var specs = field.specs[data.length - 1];
        buildMultiImageDataHelper(specs.slice(0), data.slice(0), colorSchemes, [], cb);
      } else {
        cb(null, []);
      }
    }

    function buildKeyValListData(field, data, colorSchemes, cb) {
      var curData = null
        , offsetField = null
        , yOffset = 0
        , results = []
        ;

      for (var i = 0; i < data.length; i++) {
        // Build data for key-val element, setting the y value according
        // to the field's yIncr and y values
        curData = data[i];

        yOffset = i * field.yIncr + field.y;
        offsetField = Object.assign({}, field.keyValSpec);
        offsetField.y += yOffset;

        results = results.concat(
          buildKeyValTextData(offsetField, curData, colorSchemes)
        );

        // Draw additionalElements (which do not require data)
        field.additionalElements.forEach(function(elemField) {
          switch(elemField.type) {
            case 'line':
              offsetField = Object.assign({}, elemField);
              offsetField.startY += yOffset;
              offsetField.endY += yOffset;
              results.push(buildLineData(offsetField, colorSchemes));
              break;
            default:
              return cb(new Error('Unsupported field type: ' + elemField.type));
          }
        });
      }

      return cb(null, results);
    }

    function buildDataForField(field, data, colorSchemes, cb) {
      switch (field.type) {
        case 'color':
          cb(null, [buildColorData(field, data, colorSchemes)]);
          break;
        case 'line':
          cb(null, [buildLineData(field, colorSchemes)]);
          break;
        case 'text':
          cb(null, [buildTextData(field, data, colorSchemes)]);
          break;
        case 'key-val-text':
          cb(null, buildKeyValTextData(field, data, colorSchemes));
          break;
        case 'image':
        case 'labeled-choice-image':
          buildImageData(field, data, colorSchemes, cb);
          break;
        case 'multi-image':
          buildMultiImageData(field, data, colorSchemes, cb);
          break;
        case 'key-val-list':
          buildKeyValListData(field, data, colorSchemes, cb);
          break;
        default:
          return cb(new Error('Invalid field type: ' + field.type));
      }
    }

    function buildColorSchemes(colorSchemeFields) {
      var colorSchemes = {};

      colorSchemeFields.forEach(function(field) {
        var colorScheme = resolveChosenValue(field);
        colorSchemes[field.id] = colorScheme;
      });

      return colorSchemes;
    }

    function resolveChosenValue(field) {
      var fieldValue = field.value
        , fieldChoices = card.choices[field.id]
        , dataValue = card.data[field.id]
        , fieldDefault = card.defaultData[field.id]
        , dataSrc = null
        , chosenValue = null
        ;

      /*
       * Choose data from, in order of preference:
       * 1) User-supplied data
       * 2) Card default data
       * 3) Field default data
       */
      // != null is true for undefined as well (don't use !==)
      if (dataValue != null) {
        dataSrc = dataValue;
      } else if (fieldDefault != null) {
        dataSrc = fieldDefault;
      } else if (fieldValue != null) {
        dataSrc = field;
      }

      if (dataSrc != null) {
        if (dataSrc.choiceIndex != null) {
          chosenValue = resolveChoice(dataSrc.choiceIndex, fieldChoices);

          if (dataSrc.value != null) {
            Object.assign(chosenValue, dataSrc.value);
          }
        } else {
          chosenValue = dataSrc.value;
        }
      }

      return chosenValue;
    }

    function buildDrawingDataHelper(colorSchemes, fields, drawingData, cb) {
      if (fields.length === 0) {
        return cb(null, drawingData.reverse());
      }

      var field = fields.pop()
        , chosenValue = resolveChosenValue(field)
        ;

      buildDataForField(field, chosenValue, colorSchemes, function(err, fieldResults) {
        if (err) return cb(err);

        drawingData = drawingData.concat(fieldResults);
        return buildDrawingDataHelper(colorSchemes, fields, drawingData, cb);
      });
    }

    /*
     * Build a list of elements renderable by the drawField method from the
     * card's fields and data sources. Complex fields (e.g., key-val-text) are
     * converted to primitive field types (e.g., text)
     */
    function buildDrawingData(fields, cb) {
      var colorSchemeFields = []
        , otherFields = []
        , colorSchemes = null
        ;

      fields.forEach(function(field) {
        if (field.type === 'color-scheme') {
          colorSchemeFields.push(field);
        } else {
          otherFields.push(field);
        }
      });

      colorSchemes = buildColorSchemes(colorSchemeFields);
      buildDrawingDataHelper(colorSchemes, otherFields, [], cb);
    }

    /*
     * Render the Card on the Canvas
     *
     * Parameters:
     *   cb - function(err, result)
     *
     * Result:
     *   The Canvas with the Card rendered on it
     */
    function draw(cb) {
      buildDrawingData(fields(), function(err, drawingData) {
        if (err) return cb(err);

        var ctx = canvas.getContext('2d');

        drawingData.forEach(function(data) {
          drawField(ctx, data);
        });

        return cb(null, canvas);
      });
    }
    this.draw = draw;

    function fieldRequiresData(field) {
      return field.type !== 'line';
    }

    function drawField(ctx, data) {
      switch(data.type) {
        case 'color':
          drawColor(ctx, data);
          break;
        case 'line':
          drawLine(ctx, data);
          break;
        case 'text':
          drawText(ctx, data);
          break;
        case 'image':
          drawImage(ctx, data);
          break;
        default:
          // TODO: Handle this case
      }
    }

    function drawColor(ctx, data) {
      ctx.fillStyle = data.color;
      ctx.fillRect(data.x, data.y, data.width, data.height);
    }

    function drawText(ctx, data) {
      var fontSizeLineHeightMultiplier = 1.12
        , words = null
        , width = null
        , lineX = data.x
        , curY = data.y
        , curWord = null
        , curText = null
        , newLine = false
        , value = data.text
        , x = data.x
        , y = data.y
        ;

      ctx.font = data.font;
      ctx.fillStyle = data.color;

      if (data.prefix) {
        value = data.prefix + value;
      }

      // TODO: Allow wrapping for text alignments other than default left
      if (data.wrapAt == null) {
        if (data.textAlign != null) {
          if (data.textAlign === 'center') {
            x = x - ctx.measureText(value, x, y).width / 2;
          } else if (data.textAlign === 'right') {
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

          if (newX <= data.wrapAt) {
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

    function drawImage(ctx, data) {
      var targetRatio = (data.width * 1.0) / data.height
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
        data.x,
        data.y,
        data.width,
        data.height
      );
    }

    function drawLine(ctx, data) {
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.width;

      ctx.beginPath();
      ctx.moveTo(data.startX, data.startY);
      ctx.lineTo(data.endX, data.endY);
      ctx.stroke();
    }
  }

  /*
   * Coarse check to see if we're in a Node.js environment or not and export
   * TemplateRenderer accordingly.
   */
  if (typeof module === "undefined") {
    window.TemplateRenderer = TemplateRenderer;
  } else {
    module.exports = TemplateRenderer;
  }
})();
