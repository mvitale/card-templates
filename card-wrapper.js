/*
 * Wrapper for a Card instance or JSONified Card data for getting and setting
 * field values.
 */

var exports = (function() {
  var exports = {};

  var templateSupplier = null
    , renderer = null
    ;

  exports.setTemplateSupplier = function(supplier) {
    templateSupplier = supplier;
  };

  exports.setRenderer = function(theRenderer) {
    renderer = theRenderer
  }

  exports.newInstance = function(card, cb) {
    if (!templateSupplier) {
      return cb(new Error('Template supplier not set'));
    }

    templateSupplier.supply(card.templateName, function(err, template) {
      if (err) {
        return cb(err);
      }

      // TODO: refactor
      renderer.setCard(card, function(err) {
        if (err) {
          return cb(err);
        }

        return cb(null, new CardWrapper(card, template, renderer));
      });
    });
  };

  function CardWrapper(card, template, renderer) {
    var card = card
      , template = template
      , renderer = renderer
      ;

    var defaultZoomLevel = 0
      ;

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

    this.draw = function() {
      renderer.draw(function(err) {
        if (err) console.log(err);
      });
    }

    this.rawCard = card;
  }

  return exports;
})();


if (typeof module !== 'undefined') {
  module.exports = exports;
} else {
  window.CardWrapper = exports;
}
