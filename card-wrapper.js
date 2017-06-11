/*
 * Wrapper for a Card instance or JSONified Card data for getting and setting
 * field values.
 */

var exports = (function() {
  var exports = {};

  var templateSupplier = null
    ;

  exports.setTemplateSupplier = function(supplier) {
    templateSupplier = supplier;
  };

  exports.newInstance = function(card, cb) {
    if (!templateSupplier) {
      return cb(new Error('Template supplier not set'));
    }

    templateSupplier.supply(card.templateName, function(err, template) {
      if (err) {
        return cb(err);
      }

      return cb(null, new CardWrapper(card, template));
    });
  };

  function CardWrapper(card, template) {
    var card = card
      , template = template
      , that = this
      , changeCbs = []
      ;

    var defaultZoomLevel = 0
      ;

    function change(cb) {
      changeCbs.push(cb);
    }
    this.change = change;

    function changeEvent() {
      changeCbs.forEach(function(cb) {
        cb();
      });
    }

    function width() {
      return template.width;
    }
    that.width = width;

    function height() {
      return template.height;
    }
    that.height = height;

    function checkFieldNameValid(name, type) {
      // TODO: check this condition
      if (!(name in template.fields) || template.fields[name].type !== type) {
        throw new Error('invalid field name');
      }
    }

    function setDataAttr(fieldName, attr, value) {
      var data = card.data[fieldName];

      if (!data) {
        data = {};
        card.data[fieldName] = data;
      }

      if (!data.value) {
        data.value = {};
      }

      data.value[attr] = value;

      changeEvent();
    }
    this.setDataAttr = setDataAttr;

    function getDataAttr(fieldName, attr, defaultVal) {
      var data = card.data[fieldName]
        , value = data ? data.value : null
        , attrVal = value ? value[attr] : null
        ;

      if (!attrVal) {
        attrVal = defaultVal;
      }

      return attrVal;
    }
    this.getDataAttr = getDataAttr;

    this.getFieldChoices = function(fieldId) {
      return card.choices[fieldId];
    }

    this.getZoomLevel = function(imgFieldName) {
      checkFieldNameValid(imgFieldName, 'image');
      return getDataAttr(imgFieldName, 'zoomLevel', defaultZoomLevel);
    }

    this.setZoomLevel = function(imgFieldName, zoomLevel) {
      checkFieldNameValid(imgFieldName, 'image');
      setDataAttr(imgFieldName, 'zoomLevel', zoomLevel);
    }

    this.getImageLocation = function(fieldName) {
      var field = template.fields[fieldName];

      checkFieldNameValid(fieldName, 'image');

      return {
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height
      };
    }

    function fieldForId(id) {
      var field = template.fields[id];
      return Object.assign({ id: id}, field);
    }

    /*
     * Get all editable fields from the Card's template
     */
    function editableFields() {
      return fields().filter(function(field) {
        return field.label != null;
      });
    }

    /*
     * Get all fields from the Card's template
     */
    function fields() {
      var ret = []
        , fieldIds = Object.keys(template.fields)
        , fieldId = null
        , field = null;

      for (var i = 0; i < fieldIds.length; i++) {
        fieldId = fieldIds[i];

        ret.push(fieldForId(fieldId));
      }

      return ret;
    }

    function imageFields() {
      return editableFields().filter((field) => {
        return field.type === 'image';
      });
    }
    this.imageFields = imageFields;

    function resolveChoice(choiceIndex, fieldChoices) {
      var chosenValue = null;

      if (typeof choiceIndex === 'number') {
        chosenValue = fieldChoices[choiceIndex];
      } else if (Array.isArray(choiceIndex)) { // Assume array of indices
        chosenValue = [];

        choiceIndex.forEach(function(index) {
         chosenValue.push(fieldChoices[index]);
        });
      }

      return chosenValue;
    }

    this.getFieldValue = function(fieldId) {
      var field = fieldForId(fieldId)
        , fieldValue = field.value
        , fieldChoices = card.choices[field.id]
        , dataValue = card.data[field.id]
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

    function buildImageData(field, data, colorSchemes) {
      var results = [];

      if (field.credit) {
        results.push(buildTextData(field.credit, data.credit, colorSchemes));
      }

      results.push(buildImageDataHelper(field, data));

      return results;
    }

    function buildImageDataHelper(field, data) {
        var result = {
          type: 'image',
          x: field.x,
          y: field.y,
          height: field.height,
          width: field.width,
          panX: data.panX,
          panY: data.panY,
          rotate: data.rotate,
          flipVert: data.flipVert,
          flipHoriz: data.flipHoriz,
          zoomLevel: data.zoomLevel,
          url: data.url,
          id: field.id
        };

      return result;
    }

    function buildMultiImageDataHelper(fields, datas, colorSchemes) {
      var results = [];

      for (var i = 0; i < fields.length; i++) {
        var field = fields[i]
          , data = datas[i]
          ;

        results.push(buildImageDataHelper(field, data));
      }

      return results;
    }

    function buildMultiImageData(field, data, colorSchemes) {
      var results = []
        , specs
        ;

      if (data.length) {
        specs = field.specs[data.length - 1];
        results = buildMultiImageDataHelper(
          specs.slice(0),
          data.slice(0),
          colorSchemes
        );
      }

      return results;
    }

    function buildKeyValListData(field, data, colorSchemes) {
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

        // additionalElements (which do not require data)
        field.additionalElements.forEach(function(elemField) {
          switch(elemField.type) {
            case 'line':
              offsetField = Object.assign({}, elemField);
              offsetField.startY += yOffset;
              offsetField.endY += yOffset;
              results.push(buildLineData(offsetField, colorSchemes));
              break;
            default:
              throw new Error('Unsupported field type: ' + elemField.type);
          }
        });
      }

      return results;
    }

    function buildDataForField(field, data, colorSchemes) {
      var results;

      switch (field.type) {
        case 'color':
          results = [buildColorData(field, data, colorSchemes)];
          break;
        case 'line':
          results = [buildLineData(field, colorSchemes)];
          break;
        case 'text':
          results = [buildTextData(field, data, colorSchemes)];
          break;
        case 'key-val-text':
          results = buildKeyValTextData(field, data, colorSchemes);
          break;
        case 'image':
        case 'labeled-choice-image':
          results = buildImageData(field, data, colorSchemes);
          break;
        case 'multi-image':
          results = buildMultiImageData(field, data, colorSchemes);
          break;
        case 'key-val-list':
          results = buildKeyValListData(field, data, colorSchemes);
          break;
        default:
          throw new Error('Invalid field type: ' + field.type);
      }

      return results;
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

    /*
     * Build a list of elements renderable by the drawField method from the
     * card's fields and data sources. Complex fields (e.g., key-val-text) are
     * converted to primitive field types (e.g., text)
     */
    function buildDrawingData() {
      var colorSchemeFields = []
        , otherFields = []
        , colorSchemes = null
        , drawingData = []
        ;

      fields().forEach(function(field) {
        if (field.type === 'color-scheme') {
          colorSchemeFields.push(field);
        } else {
          otherFields.push(field);
        }
      });

      colorSchemes = buildColorSchemes(colorSchemeFields);

      otherFields.forEach(function(field) {
        var chosenValue = resolveChosenValue(field)
          , fieldDatas = buildDataForField(field, chosenValue, colorSchemes)

        drawingData = drawingData.concat(fieldDatas);
      });

      return drawingData;
    }
    this.buildDrawingData = buildDrawingData;

    this.rawCard = card;
  }





  return exports;
})();


if (typeof module !== 'undefined') {
  module.exports = exports;
} else {
  window.CardWrapper = exports;
}
