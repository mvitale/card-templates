/*
 * Wrapper for a Card instance or JSONified Card data for getting and setting
 * field values.
 */

var exports = (function() {
  var exports = {};

  var templateSupplier = null;

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

      if (attrVal === null) {
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

    this.rawCard = card;
  }

  return exports;
})();


if (typeof module !== 'undefined') {
  module.exports = exports;
} else {
  window.CardWrapper = exports;
}
