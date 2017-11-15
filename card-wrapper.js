/*
 * Wrapper for a Card instance or JSONified Card data for getting and setting
 * field values.
 */

var exports = (function() {
  var exports = {};

  var templateSupplier
    , dataPersistence
    ;

  exports.setTemplateSupplier = function(supplier) {
    templateSupplier = supplier;
  };

  exports.setDataPersistence = function(persistence) {
    dataPersistence = persistence;
  }

  exports.newInstance = function(card, cb) {
    if (!templateSupplier) {
      return cb(new Error('Template supplier not set'));
    }

    templateSupplier.supply(card.templateName, card.templateVersion, card.locale, function(err, template) {
      if (err) {
        return cb(err);
      }

      return cb(null, new CardWrapper(card, template, false));
    });
  };

  function CardWrapper(card, template, dirty) {
    var that = this;

    if (!card.userData) {
      card.userData = {};
    }

    var defaultZoomLevel = 0
      ;

    /*
     * Get the width of this card, as specified in its template
     */
    function width() {
      return template.spec.width;
    }
    that.width = width;

    /*
     * Get the height of this card, as specified in its template.
     */
    function height() {
      return template.spec.height;
    }
    that.height = height;

    function id() {
      return card.id;
    }
    that.id = id;

    /*
     * True if there are unsaved changes, false o/w
     */
    function isDirty() {
      return dirty;
    }
    that.isDirty = isDirty;

    function checkFieldNameTypeValid(name, type) {
      var field = checkFieldNameValid(name);

      if (field.type !== type) {
        throw new Error('field not of required type');
      }

      return field;
    }

    /*
     * True if this card's template contains a field with name <name> and
     * type <type>, false o/w.
     */
    function checkFieldNameValid(name) {
      // TODO: check this condition
      if (!(name in template.spec.fields)) {
        throw new Error('invalid field name');
      }

      return fieldForId(name);
    }

    function dataForFieldHelper(fieldId, key, forceNew) {
      var data = card[key][fieldId];

      if (!data || forceNew) {
        data = {};
        card[key][fieldId] = data;
      }

      return data;
    }

    /*
     * Get card.userData[fieldId], defaulting to {} if not already present
     */
    function userDataForField(fieldId) {
      return dataForFieldHelper(fieldId, 'userData', false);
    }

    /*
     * Get card.data[fieldId], defaulting to {} if not already present
     */
    function dataForField(fieldId) {
      return dataForFieldHelper(fieldId, 'data', false);
    }

    /*
     * Get the object on which data attributes should be set.
     * If a userDataKey is set, the userData object to which it refers is returned.
     * Otherwise, card.data[fieldName].value is returned, defaulting to {} if not already
     * present.
     */
    function getDataValue(fieldName) {
      var field = checkFieldNameValid(fieldName)
        , fieldData = dataForField(fieldName)
        , value
        ;

      if (fieldData.userDataKey) {
        value = userDataForField(fieldName)[fieldData.userDataKey];
      } else  {
        if (!fieldData.value) {
          fieldData.value = {};
        }

        value = fieldData.value;
      }

      return value;
    }

    /*
     * Set an attribute for a field, e.g., zoomLevel for an image field.
     */
    function setDataAttr(fieldName, attr, value) {
      setDataAttrHelper(fieldName, attr, value, false);
    }
    that.setDataAttr = setDataAttr;

    /*
     * Same as setDataAttr, except this version does not cause a change in dirty
     * state. This should be used when the caller intends to revert the card to
     * the state it was in before this method was called, e.g., in the card
     * editor when the user hovers over a font size.
     */
    function setDataAttrNotDirty(fieldName, attr, value) {
      setDataAttrHelper(fieldName, attr, value, true);
    }
    that.setDataAttrNotDirty = setDataAttrNotDirty;

    /*
     * Force card to dirty state. Can be
     * used to finalize a value set by setDataAttrNotDirty for preview
     * purposes.
     */
    function forceDirty() {
      setDirty(true);
    }
    that.forceDirty = forceDirty;

    function setDataAttrHelper(fieldName, attr, value, notDirty) {
      var field = checkFieldNameValid(fieldName)
        , dataToModify = getDataValue(fieldName)
        , curValue = dataToModify[attr]
        ;

      if (curValue !== value) {
        dataToModify[attr] = value;
      }

      setDirty(isDirty() || !notDirty);
    }

    /*
     * Set a field's data to refer to a user data object
     */
    function setUserDataRef(fieldName, key) {
      var field = checkFieldNameValid(fieldName)
        , data = wipeData(fieldName);
      data.userDataKey = key;
      setDirty(true);
    }
    that.setUserDataRef = setUserDataRef;

    /*
     * Get the user data key to which a field's data object refers, or
     * undefined if not present.
     */
    function getUserDataRef(fieldName) {
      var data = dataForField(fieldName);
      return data.userDataKey;
    }
    that.getUserDataRef = getUserDataRef;

    /*
     * Set an attribute on a field's user data bucket.
     */
    function setUserDataAttr(fieldName, bucket, key, value) {
      var field = checkFieldNameValid(fieldName)
        , userData = userDataForField(fieldName);
        ;

      if (!userData[bucket]) {
        userData[bucket] = {};
      }

      userData[bucket][key] = value;
    }
    that.setUserDataAttr = setUserDataAttr;

    /*
     * Get an attribute from a field's user data bucket.
     */
    function getUserDataAttr(fieldName, bucket, key) {
      var userData = userDataForField(fieldName)
        , bucketVal = userData[bucket]
        , val = bucketVal ? bucketVal[key] : null
        ;

      return val;
    }
    that.getUserDataAttr = getUserDataAttr;

    /*
     * Special setters for key-val-list data
     */
    function setKeyValText(fieldName, keyOrVal, index, value) {
      var field = checkFieldNameValid(fieldName)
        , data = dataForField(fieldName)
        ;

      if (!data.value || !data.value.length) {
        data.value = new Array(field.max);

        for (var i = 0; i < data.value.length; i++) {
          data.value[i] = {
            key: {
              text: ''
            },
            val: {
              text: ''
            }
          };
        }
      }

      data.value[index][keyOrVal].text = value;
      setDirty(true);
    }
    that.setKeyValText = setKeyValText;

    /*
     * Set a choice index for a field. This deletes the data's value attribute
     * if present.
     */
    function setChoiceKey(fieldName, key) {
      var field = checkFieldNameValid(fieldName)
        , data = wipeData(fieldName)
        ;

      data.choiceKey = key;
      setDirty(true);
    }
    that.setChoiceKey = setChoiceKey;

    /*
     * Wipe a field's data (set to {}).
     */
    function wipeData(fieldName) {
      var data = dataForFieldHelper(fieldName, 'data', true);
      return data;
    }
    that.wipeData = wipeData;

    /*
     * Get choiceKey for a field (if present)
     */
    function getChoiceKey(fieldName, defaultVal) {
      var data = dataForField(fieldName)
        , choiceKey = data.choiceKey
        ;

      return choiceKey;
    }
    that.getChoiceKey = getChoiceKey;

    /*
     * Get the value of a data attribute for a field, or <defaultVal>
     * if it isn't set or is set to null.
     */
    function getDataAttr(fieldName, attr, defaultVal) {
      var field = checkFieldNameValid(fieldName)
        , value = resolvedFieldData(field)
        , attrVal = value ? value[attr] : null
        ;

      if (!attrVal) {
        attrVal = defaultVal;
      }

      return attrVal;
    }
    that.getDataAttr = getDataAttr;

    function templateOrCardFieldData(bucket, fieldId) {
      var result = null;
      if (template[bucket] && fieldId in template[bucket]) {
        result = template[bucket][fieldId];
      } else if (card[bucket] && fieldId in card[bucket]) {
        result = card[bucket][fieldId];
      }

      return result;
    }

    /*
     * Get the list of default choices for a field.
     */
    that.getFieldChoices = function(fieldId) {
      return templateOrCardFieldData('choices', fieldId);
    }

    /*
     * Object { [choiceKey1]: choice1, ..., [choiceKeyN]: choiceN}
     */
    getFieldChoicesMap = function(fieldId) {
      var choiceList = that.getFieldChoices(fieldId)
        , result = {}
        , curChoice
        ;

      if (choiceList) {
        for (var i = 0; i < choiceList.length; i++) {
          curChoice = choiceList[i];
          result[curChoice.choiceKey] = curChoice;
        }
      }

      return result;
    }

    /*
     * Get the choice tips for a field
     */
    that.getFieldChoiceTips = function(fieldId) {
      return templateOrCardFieldData('choiceTips', fieldId);
    }

    /*
     * Get the drawing coordinates and dimensions for an 'image' field.
     */
    that.getImageLocation = function(fieldName) {
      var field = checkFieldNameTypeValid(fieldName, 'image');

      return {
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height
      };
    }

    /*
     * Get the field specification with a given id from the template enriched
     * with the id as an added attribute.
     */
    function fieldForId(id) {
      var field = template.spec.fields[id];
      return Object.assign({ id: id } , field);
    }

    /*
     * Get all editable fields from the Card's template
     */
    function editableFields() {
      return fields().filter(function(field) {
        return field.label != null;
      });
    }
    that.editableFields = editableFields;

    /*
     * Get all fields from the Card's template
     */
    function fields() {
      var ret = []
        , fieldIds = Object.keys(template.spec.fields)
        , fieldId = null
        , field = null;

      for (var i = 0; i < fieldIds.length; i++) {
        fieldId = fieldIds[i];

        ret.push(fieldForId(fieldId));
      }

      return ret;
    }

    /*
     * Get all editable image fields from the Card's template
     */
    function imageFields() {
      return editableFields().filter(function(field) {
        return field.type === 'image';
      });
    }
    that.imageFields = imageFields;

    /*
     * Given a choiceKey and a map of fieldChoices, return the corresponding
     * value(s). choiceKey may be a number, string or Array. In the latter case,
     * a list of values is returned.
     */
    function resolveChoice(choiceKey, fieldChoices) {
      var chosenValue = null;

      if (Array.isArray(choiceKey)) {
        chosenValue = [];

        choiceKey.forEach(function(index) {
         chosenValue.push(fieldChoices[index]);
        });
      } else {
        chosenValue = fieldChoices[choiceKey];
      }

      return chosenValue;
    }

    /*
     * Get a field's data value. If a field has a choiceKey and a value,
     * merge the value into the resolved choice(s).
     */
    function resolvedFieldData(field) {
      var fieldValue = field.value || {}
        , fieldChoices = getFieldChoicesMap(field.id)
        , dataValue = getDataValue(field.id)
        , choiceKey = getChoiceKey(field.id)
        , chosenValue = null
        , mergedValue
        , curVal
        ;

      if (dataValue instanceof Array) {
        mergedValue = [];

        for (var i = 0; i < dataValue.length; i++) {
          curVal = dataValue[i];
          mergedValue[i] = Object.assign({}, fieldValue, curVal);
        }
      } else {
        mergedValue = {};
        Object.assign(mergedValue, fieldValue, dataValue);
      }

      if (choiceKey != null) {
        chosenValue = resolveChoice(choiceKey, fieldChoices);
        mergedValue = Object.assign({}, chosenValue, mergedValue);
      }

      return mergedValue;
    }
    that.resolvedFieldData = resolvedFieldData;

    /*
     * Resolve a color scheme reference in a field's data value. Color scheme
     * references are of the form $<color_scheme_name>.<color_key>.
     */
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

    /*
     * Build drawing data for field type 'color'
     */
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

    /*
     * Build drawing data for field type 'line'
     */
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

    /*
     * Build drawing data for field type 'text'
     */
    function buildTextData(field, data, colorSchemes) {
      var text = data == null || data.text == null ? '' : data.text
        , font = field.font
        , fontParts = []
        , fontSz
        , fontFamily
        , fontStyle
        ;

      if (!font) {
        fontSz = data.fontSz;
        fontFamily = field.fontFamily;
        fontStyle = field.fontStyle;

        if (fontStyle) {
          fontParts.push(fontStyle);
        }

        fontParts.push(fontSz + 'px');
        fontParts.push(fontFamily);

        font = fontParts.join(' ');
      }

      return buildTextDataHelper(
        field.x,
        field.y,
        font,
        field.color,
        field.prefix,
        field.wrapAt,
        field.textAlign,
        text,
        colorSchemes
      );
    }

    /*
     * Build drawing data for field type key-val-text.
     */
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

    /*
     * Build drawing data of type 'text'
     */
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

    /*
     * Build drawing data for field type 'text-icon'
     */
    function buildTextIconData(field, data, colorSchemes) {
      return [
        buildTextDataHelper(
          field.x, // TODO: this is WRONG
          field.y,
          field.font,
          field.color,
          null,
          null,
          'center',
          data.text,
          colorSchemes
        ),
        buildImageDataHelper(field, data)
      ];
    }

    /*
     * Build drawing data for field type 'image'
     */
    function buildImageData(field, data, colorSchemes) {
      var results = [];

      if (field.credit) {
        results.push(buildTextData(field.credit, data.credit, colorSchemes));
      }

      if (data.url) {
        results.push(buildImageDataHelper(field, data));
      }

      return results;
    }

    /*
     * Build drawing data of type image
     */
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

    /*
     * Build drawing data for field type 'multi-image'
     */
    function buildMultiImageData(field, datas, colorSchemes) {
      var results = []
        , specs
        ;

      if (datas.length) {
        specs = field.specs[datas.length - 1];

        for (var i = 0; i < specs.length; i++) {
          var spec = specs[i]
            , data = datas[i]
            ;

          results.push(buildImageDataHelper(spec, data));
        }
      }

      return results;
    }

    /*
     * Build drawing data for field type key-val-list
     */
    function buildKeyValListData(field, data, colorSchemes) {
      var curData = null
        , offsetField = null
        , yOffset = 0
        , results = []
        , filteredData = data.filter(function(datum) {
            return datum.key.text || datum.val.text;
          })
        ;

      for (var i = 0; i < filteredData.length; i++) {
        // Build data for key-val element, setting the y value according
        // to the field's yIncr and y values
        curData = filteredData[i];

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

    /*
     * Build drawing data for a field
     */
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
        case 'multiline-text':
          results = [buildTextData(field, data, colorSchemes)];
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
        case 'text-icon':
          results = buildTextIconData(field, data, colorSchemes);
        default:
          throw new Error('Invalid field type: ' + field.type);
      }

      return results;
    }

    function buildColorSchemes(colorSchemeFields) {
      var colorSchemes = {};

      colorSchemeFields.forEach(function(field) {
        var colorScheme = resolvedFieldData(field);
        colorSchemes[field.id] = colorScheme;
      });

      return colorSchemes;
    }

    /*
     * Build a list of primitive drawing data elements (of the types recognized
     * by the renderer) from the card.
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
        var chosenValue = resolvedFieldData(field)
          , fieldDatas = buildDataForField(field, chosenValue, colorSchemes)

        drawingData = drawingData.concat(fieldDatas);
      });

      return drawingData;
    }
    that.buildDrawingData = buildDrawingData;

    function save(cb) {
      if (!dataPersistence) {
        return cb(new Error('Data persistence not set'));
      }

      dataPersistence.save(card, function(err) {
        if (err) return cb(err);
        setDirty(false);
        cb();
      });
    }
    that.save = save;

    function getTemplateParam(key) {
      return card.templateParams[key];
    }
    that.getTemplateParam = getTemplateParam;

    function clone() {
      var cardClone = JSON.parse(JSON.stringify(card));
      return new CardWrapper(cardClone, template, isDirty());
    }
    that.clone = clone;

    function setDirty(newVal) {
      if (dirty !== newVal) {
        dirty = newVal;
      }
    }
  }

  return exports;
})();


if (typeof module !== 'undefined') {
  module.exports = exports;
} else {
  window.CardWrapper = exports;
}
