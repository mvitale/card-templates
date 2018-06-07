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

    function templateName() {
      return card.templateName;
    }
    that.templateName = templateName;

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
      if (!fieldNameValid(name)) {
        throw new Error('invalid field name: ' + name);
      }

      return fieldForId(name);
    }

    function fieldNameValid(name) {
      return name in template.spec.fields;
    }
    that.fieldNameValid = fieldNameValid;

    function dataForFieldHelper(fieldId, key, forceNew) {
      var bucket = card[key]
        , data 
        ;

      if (!bucket) {
        bucket = card[key] = {};
      }

      data = bucket[fieldId];

      if (!data || forceNew) {
        data = {};
        bucket[fieldId] = data;
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
     * Otherwise, card.data[fieldName].value is returned, defaulting to {} or [] if not already
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
          fieldData.value = isArrayField(field.type) ? [] : {}; 
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

    function getKeyValData(field) {
      var data = dataForField(field.id)
        ;

      if (!data.value || !data.value.length) {
        data.value = new Array(field.max);

        for (var i = 0; i < data.value.length; i++) {
          data.value[i] = {
            key: {},
            val: {}
          };
        }
      }

      return data;
    }

    /*
     * Special setters for key-val-list data
     */
    function setKeyValData(fieldName, keyOrVal, index, attr, value) {
      var field = checkFieldNameValid(fieldName)
        , data = getKeyValData(field)
        ;

      data.value[index][keyOrVal][attr] = value;
      setDirty(true);
    }
    that.setKeyValData = setKeyValData;

    function setKeyValChoiceKey(fieldName, keyValIndex, choiceKey) {
      var field = checkFieldNameValid(fieldName)
        , choices = getFieldChoicesMap(fieldName)
        , choice = choices[choiceKey]
        , data = getKeyValData(field)
        , value = data.value[keyValIndex]
        , cleanKey = choice.key ? {} : value.key
        , cleanVal = choice.val ? {} : value.val
        ;


      data.value[keyValIndex] = {
        key: cleanKey,
        val: cleanVal
      };

      if (!data.choiceKey) {
        data.choiceKey = new Array(field.max);
      } else if (data.choiceKey.length < field.max) {
        data.choiceKey = data.choiceKey.concat(
          new Array(field.max - data.choiceKey.length)
        );
      }

      data.choiceKey[keyValIndex] = choiceKey;
    }
    that.setKeyValChoiceKey = setKeyValChoiceKey;

    function setTextListData(fieldName, index, value) {
      var field = checkFieldNameValid(fieldName)
        , data = dataForField(field.id)
        ;

      if (!data.value || !data.value.length) {
        data.value = new Array(field.max);

        for (var i = 0; i < data.value.length; i++) {
          data.value[i] = { text: '' };
        }
      }

      data.value[index].text = value;
      setDirty(true);
    }
    that.setTextListData = setTextListData;
    
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
    function getFieldChoices(fieldId) {
      return templateOrCardFieldData('choices', fieldId);
    }
    that.getFieldChoices = getFieldChoices;

    /*
     * Object { [choiceKey1]: choice1, ..., [choiceKeyN]: choiceN}
     */
    function getFieldChoicesMap(fieldId) {
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
        return field.uiLabel != null;
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
      var chosenValue;

      if (Array.isArray(choiceKey)) {
        chosenValue = choiceKey.map(function(key) {
          var value = null;

          if (key != null) {
            value = fieldChoices[key];
          }

          return value;
        });
      } else {
        chosenValue = fieldChoices[choiceKey];
      }

      return chosenValue;
    }

    function isArrayField(type) {
      return type === 'key-val-list' || type === 'text-list';
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
        , choiceValue = null
        , mergedKey
        , mergedVal
        , mergedValue
        , curChoiceValue
        , curVal
        , numValues
        ;

      if (choiceKey != null) {
        choiceValue = resolveChoice(choiceKey, fieldChoices);
      }

      if (field.type === 'key-val-list') {
        choiceValue = choiceValue || [];
        numValues = Math.max(dataValue.length, choiceValue.length);
        mergedValue = new Array(numValues);

        for (var i = 0; i < numValues; i++) {
          curChoiceValue = i < choiceValue.length ? choiceValue[i] : {};
          curVal = i < dataValue.length ? dataValue[i] : {};
          mergedKey = Object.assign(
            {}, 
            (fieldValue && fieldValue.key) || {}, 
            (curChoiceValue && curChoiceValue.key) || {}, 
            (curVal && curVal.key) || {}
          );
          mergedVal = Object.assign(
            {}, 
            (fieldValue && fieldValue.val) || {}, 
            (curChoiceValue && curChoiceValue.val) || {}, 
            (curVal && curVal.val) || {}
          );
          mergedValue[i] = { key: mergedKey, val: mergedVal };
        }
      } else if (isArrayField(field.type)) {
        mergedValue = new Array(dataValue.length);
        for (var i = 0; i < mergedValue.length; i++) {
          mergedValue[i] = Object.assign({}, fieldValue || {}, dataValue[i]) 
        }
      } else {
        mergedValue = Object.assign({}, fieldValue, choiceValue || {}, dataValue);
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

    function fieldColor(field) {
      if (!field.color) {
        throw new TypeError('field missing color attribute');
      }

      var colorFields = fields().filter(function(field) {
        return field.type === 'color-scheme'; 
      });

      return resolveColor(buildColorSchemes(colorFields), field.color);
    }
    that.fieldColor = fieldColor;

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
     * Build drawing data for field type 'text'
     */
    function buildTextData(field, data, colorSchemes) {
      var text = data == null || data.text == null ? '' : data.text
        , font = field.font
        , fontParts = []
        , fontSz
        , fontFamily
        , fontStyle
        , bg = null
        , results = []
        , fontOptions = {}
        ;

      if (
        field.labelFor &&
        !Object.keys(resolvedFieldData(checkFieldNameValid(field.labelFor))).length
      ) {
        text = '';
      }

      if (!font) {
        fontOptions.fontSize = data.fontSz;
        fontOptions.fontFamily = field.fontFamily;

        fontSz = data.fontSz;
        fontFamily = "'" + field.fontFamily + "'";
        fontStyle = field.fontStyle;

        if (fontStyle) {
          fontParts.push(fontStyle);
        }

        fontParts.push(fontSz + 'px');
        fontParts.push(fontFamily);

        font = fontParts.join(' ');
      }

      /* 
       * There are two versions of the bg property:
       * 1) x and width are specified. In that case, we can just build a normal
       * color element here.
       * 2) x and width aren't specified; an hPad value is. In that case, the 
       * TemplateRenderer needs to calculate the x value and width dynamically,
       * so we pass a bg options attribute as part of the text data.
       */
      if (
        field.bg && 
        data.bgColor
      ) {
        if (field.bg.x) {
          results.push(
            buildColorData(
              field.bg, { 
                color: data.bgColor 
              }, colorSchemes
            )
          );
        } else {
          bg = {
            color: data.bgColor,
            height: field.bg.height,
            hPad: field.bg.hPad,
            y: field.bg.y
          }
        }
      }

      results.push(
        buildTextDataHelper(
          field.x,
          field.y,
          font,
          field.color,
          field.prefix,
          field.wrapAt,
          field.textAlign,
          field.lineHeight,
          bg,
          text,
          colorSchemes,
          fontOptions
        )
      );

      return results;
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
      lineHeight,
      bg,
      text,
      colorSchemes,
      fontOptions
    ) {
      var resolvedColor = resolveColor(colorSchemes, color);
        
      fontOptions = fontOptions || {};

      return {
        type: 'text',
        font: font,
        color: resolvedColor,
        text: text,
        prefix: prefix,
        x: x,
        y: y,
        wrapAt: wrapAt,
        textAlign: textAlign,
        lineHeight: lineHeight,
        bg: bg,
        fontFamily: fontOptions.fontFamily,
        fontSize: fontOptions.fontSize
      };
    }

    /*
     * Build drawing data for field type 'text-icon'
     */
    function buildTextIconData(field, data, colorSchemes) {
      var results = [];

      if (Object.keys(data).length) {
        addImageDataToResults(field, data, colorSchemes, results);
        results.push(buildTextDataHelper(
          field.x + field.width / 2,
          field.y + field.textOffsetY,
          field.font,
          field.color,
          null,
          null,
          'center',
          null,
          null,
          data.text,
          colorSchemes
        ));
      }

      return results;
    }

    function buildIconData(field, data, colorSchemes) {
      var results = [];
      addImageDataToResults(field, data, colorSchemes, results);
      return results;
    }

    /*
     * Build drawing data for field type 'image'
     */
    function buildImageData(field, data, colorSchemes) {
      var results = []
        , url = data.url ? resolveColor(colorSchemes, data.url) : null
        ;

      if (field.credit) {
        results = buildTextData(field.credit, data.credit, colorSchemes);
      }

      addImageDataToResults(field, data, colorSchemes, results);

      return results;
    }

    /*
     * Build drawing data of type image
     */
    function addImageDataToResults(field, data, colorSchemes, results) {
      var url = data.url ? resolveColor(colorSchemes, data.url) : null;

      if (url) {
        results.push({
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
          url: resolveColor(colorSchemes, data.url),
          id: field.id
        });
      }
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

          addImageDataToResults(spec, data, colorSchemes, results);
        }
      }

      return results;
    }

    function buildKeyOrValData(field, baseX, baseY, data, colorSchemes) {
      var offsetField = Object.assign({}, field);
      offsetField.x += baseX;
      offsetField.y += baseY;

      if (field.bg) {
        offsetField.bg = Object.assign({}, field.bg);
        offsetField.bg.x += baseX;
        offsetField.bg.y += baseY;
      }

      return buildTextData(offsetField, data, colorSchemes);
    }

    /*
     * Build drawing data for field type key-val-list
     */
    function buildKeyValListData(field, data, colorSchemes) {
      var curData = null
        , offsetField = null
        , yOffset
        , results = []
        , baseX
        , colIndex
        , filteredData = data.filter(function(datum) {
            return datum.key.text || datum.val.text;
          })
        ;

      for (var i = 0; i < filteredData.length; i++) {
        baseX = 0;
        colIndex = i;

        if (field.x) {
          baseX = field.x;
        } else if (field.colXs) {
          baseX = field.colXs[Math.floor(i / field.perCol)];
          colIndex = i % field.perCol;
        }

        // Build data for key-val element, setting the y value according
        // to the field's yIncr and y values
        curData = filteredData[i];
        yOffset = colIndex * field.yIncr + field.y;

        results = results.concat(
          buildKeyOrValData(field.key, baseX, yOffset, curData.key, colorSchemes)
        ).concat(buildKeyOrValData(field.val, baseX, yOffset, curData.val, colorSchemes));

        /*
        // additionalElements (which do not require data)
        if (field.additionalElements) {
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
        */
      }

      return results;
    }

    function buildTextListData(field, data, colorSchemes) {
      return [{
        type: 'text-list',
        x: field.x,
        y: field.y,
        font: field.font,
        color: field.color,
        yIncr: field.yIncr,
        wrapAt: field.wrapAt,
        separator: field.separator,
        values: data.filter(function(datum) { 
          return datum.text;
        })
      }];
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
          ;

        drawingData = drawingData.concat(fieldDatas);

        if (field.label && chosenValue.label) {
          drawingData = drawingData.concat(buildTextData(
            field.label, 
            { text: chosenValue.label }, 
            colorSchemes
          ));
        }
      });

      return drawingData;
    }
    that.buildDrawingData = buildDrawingData;

    /*
     * Build drawing data for a field
     */
    function buildDataForField(field, data, colorSchemes) {
      var results;

      switch (field.type) {
        case 'color':
          results = [buildColorData(field, data, colorSchemes)];
          break;
        case 'text':
        case 'multiline-text':
        case 'labeled-text':
          results = buildTextData(field, data, colorSchemes);
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
          break;
        case 'icon':
          results = buildIconData(field, data, colorSchemes);
          break;
        case 'text-list':
          results = buildTextListData(field, data, colorSchemes);
          break;
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
