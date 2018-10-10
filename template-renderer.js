/*
 * Renders a Canvas image from a Card. This module functions in both Node.js and
 * browser environments: when used in a Node environment, it behaves as a normal
 * Node module; otherwise, it is globally available as window.TemplateRenderer.
 *
 * To use, construct a TemplateRenderer instance templateRenderer, call
 * templateRenderer.setCard with the card data, and call templateRenderer.render
 * to draw the card to the Canvas instance.
 *
 * Parameters:
 *   canvasSupplier - must implement canvasSupplier.supply(width, height), which
 *   returns a Canvas instance with the specified width and height.
 *
 *   imageFetcher - must implement imageFetcher.fetch(url, cb), where url is an
 *   image url, which yields an image object that can be drawn on the Canvas context
 *   using c.drawImage.
 *
 * ---------------------------------------------------------------------------
 *
 * After all dependencies have been injected, call setCard to set the card to
 * render, then draw to render the card to a Canvas.
 */
(function() {
  function RotatedImageCache(canvasSupplier) {
    var that = this
      , cache = {}
      ;

    function RotatedImage(image, rotationDegrees, flipHoriz, flipVert, imageWidth, imageHeight) {
      var that = this;

      that.image = image;
      that.degrees = rotationDegrees;
      that.flipHoriz = flipHoriz;
      that.flipVert = flipVert;

      buildCanvas();

      function rotateVector(v, theta) {
        var cosTheta = Math.cos(theta)
          , sinTheta = Math.sin(theta)
          ;

        return {
          x: cosTheta * v.x - sinTheta * v.y,
          y: sinTheta * v.x + cosTheta * v.y
        };
      }

      /*
       * Given a width and height, we can produce three vectors in R2 that describe a rectangle
       * with one point on the origin and the other points being the endpoints of the vectors.
       * This function returns those vectors rotated around the origin by theta radians.
       * e2 describes the farthest point from the origin.
       */
      function rotatedRectVectors(width, height, theta) {
        var e1 = { x: width, y: 0 }
          , e2 = { x: width, y: height }
          , e3 = { x: 0, y: height }
          ;

        return {
          e1: rotateVector(e1, theta),
          e2: rotateVector(e2, theta),
          e3: rotateVector(e3, theta)
        };
      }

      function calculateDimension(d1, d2, d3) {
        return Math.max(Math.abs(d1 - d3), Math.abs(d2));
      }

      // TODO: make server-side compatible (dependency injection)
      function buildCanvas() {
        var theta = rotationDegrees * Math.PI / 180
          , vectors = rotatedRectVectors(imageWidth, imageHeight, theta)
          , canvasWidth = calculateDimension(vectors.e1.x, vectors.e2.x, vectors.e3.x)
          , canvasHeight = calculateDimension(vectors.e1.y, vectors.e2.y, vectors.e3.y)
          , xScale = flipHoriz ? -1 : 1
          , yScale = flipVert  ? -1 : 1
          , tmpCanvas = canvasSupplier.transformCanvas(canvasWidth, canvasHeight)
          ;

        tmpCtx = tmpCanvas.getContext('2d');

        tmpCtx.translate(canvasWidth / 2, canvasHeight / 2);
        tmpCtx.rotate(theta);
        tmpCtx.scale(xScale, yScale);
        tmpCtx.drawImage(image, -imageWidth/2, -imageHeight/2);

        that.canvas = tmpCanvas;
      }
    }

    that.get = function(image, name, degrees, flipHoriz, flipVert, width, height) {
      var key = name
        , result = cache[key]
        ;

      if (!result ||
          result.image.src !== image.src ||
          result.degrees !== degrees ||
          result.flipVert !== flipVert ||
          result.flipHoriz !== flipHoriz) {
        cache[key] = new RotatedImage(image, degrees, flipHoriz, flipVert, width, height);
      }

      return cache[key].canvas;
    }
  }

  var defaultTextRenderer = {
    fillText: function(ctx, text, x, y) {
      ctx.fillText(text, x, y);
    },
    textWidth: function(ctx, text) {
      return ctx.measureText(text).width;
    }
  }

  function TemplateRenderer(options) {
    var that = this
      , canvasSupplier = options.canvasSupplier
      , imageFetcher = options.imageFetcher 
      , textRenderer = options.textRenderer
      , rotatedImageCache = new RotatedImageCache(canvasSupplier)
      , logger
      ;

    if (!textRenderer) {
      textRenderer = defaultTextRenderer;
    }

    function setLogger(theLogger) {
      logger = theLogger;
    }
    that.setLogger = setLogger;

    function logError(error) {
      if (logger) {
        logger.error(error);
      } else {
        console.error(error);
      }
    }

    function resolveImage(url, cb) {
      return imageFetcher.fetch(url, cb);
    }

    function resolveImagesHelper(imageDatas, urlsToImages, cb) {
      var imageData;

      if (imageDatas.length === 0) {
        return cb(null, urlsToImages);
      }

      imageData = imageDatas.pop();

      resolveImage(imageData.url, function(err, image) {
        if (err) {
          logError(err);
        }

        urlsToImages[imageData.url] = image;
        resolveImagesHelper(imageDatas, urlsToImages, cb);
      });
    }

    function resolveImages(drawingData, cb) {
      var imageDatas = drawingData.filter(function(data) {
        return data.type === 'image';
      });

      return resolveImagesHelper(imageDatas, {}, cb);
    }

    /*
     * Render a Card on the Canvas
     *
     * Parameters:
     *   cb - function(err, result)
     *
     * Result:
     *   The Canvas with the Card rendered on it
     */
    function draw(card, options, cb) {
      var canvas
        , ctx
        , drawingData
        , imageDatas
        , images = {}
        ;

      try {
        drawingData = card.buildDrawingData();
      } catch (e) {
        return cb(e);
      }

      // Resolve images up-front to prevent flickering due to loading delay in
      // the middle of drawing to the canvas
      resolveImages(drawingData, function(err, urlsToImages) {
        if (err) return cb(err);

        // Moving this to just before drawing seems to prevent flickering on
        // redraw
        canvas = canvasSupplier.drawingCanvas(card.width(), card.height());
        ctx = canvas.getContext('2d');

        try {
          drawingData.forEach(function(data) {
            drawField(ctx, data, urlsToImages, options);
          });
        } catch (e) {
          return cb(e);
        }

        return cb(null, canvas);
      });
    }
    this.draw = draw;

    function drawField(ctx, data, urlsToImages, options) {
      switch(data.type) {
        case 'color':
          drawColor(ctx, data);
          break;
        case 'line':
          drawLine(ctx, data);
          break;
        case 'safe-space-line': 
          if (options.safeSpaceLines) {
            drawLine(ctx, data);
          }
          break;
        case 'text':
          drawText(ctx, data);
          break;
        case 'image':
          drawImage(ctx, data, urlsToImages[data.url]);
          break;
        case 'text-list':
          drawTextList(ctx, data);
          break;
        default:
          // TODO: Handle this case
      }
    }

    function drawColor(ctx, data) {
      ctx.fillStyle = data.color;
      ctx.fillRect(data.x, data.y, data.width, data.height);
    }

    function drawTextList(ctx, data) {
      var curVal
        , i
        , offsetHeight = data.y
        ;

      for (i = 0; i < data.values.length; i++) {
        curVal = data.values[i]; 
        offsetHeight += drawText(ctx, {
          text: curVal.text,
          x: data.x,
          y: offsetHeight,
          lineHeight: data.lineHeight,
          font: data.font,
          color: data.color,
          wrapAt: data.wrapAt
        });

        if (data.separator && i < data.values.length - 1) {
          drawColor(ctx, {
            color: data.separator.color,
            x: data.separator.x,
            y: offsetHeight + data.separator.yOffset,
            height: data.separator.height,
            width: data.separator.width
          });
        }

        offsetHeight += data.yIncr;
      }
    }

    function drawText(ctx, data, calcHeight) {
      var fontSizeLineHeightMultiplier = 1.12
        , words = null
        , width = null
        , lineX = data.x
        , curY = data.y
        , curWord = null
        , nextWord = null
        , newLine = false
        , sepIndex
        , curWord
        , firstWord
        , remaining
        , xIncr
        , value = data.text
        , x = data.x
        , y = data.y
        , lineHeight = data.lineHeight
        , bgWidth
        , bgX
        ;

      ctx.font = data.font;
      ctx.fillStyle = data.color;

      if (!lineHeight) {
        lineHeight = fontSizePx(ctx) * fontSizeLineHeightMultiplier;
      }

      if (data.prefix) {
        value = data.prefix + value;
      }

      var lineSlices = value.split('\n');

      // TODO: Allow wrapping for text alignments other than default left
      if (data.wrapAt == null) {
        if (data.textAlign != null) {
          if (data.textAlign === 'center') {
            x = x - textRenderer.textWidth(ctx, value) / 2;
          } else if (data.textAlign === 'right') {
            x = x - textRenderer.textWidth(ctx, value);
          }
          // left is implicit - nothing to do
        }

        if (data.bg && value.length) {
          bgX = x;
          bgWidth = textRenderer.textWidth(ctx, value);

          if (data.bg.hPad) {
            bgX -= data.bg.hPad;
            bgWidth += 2 * data.bg.hPad;
          }

          drawColor(ctx, {
            x: bgX,
            y: data.bg.y,
            width: bgWidth,
            height: data.bg.height,
            color: data.bg.color
          });
        }

        ctx.fillStyle = data.color;
        textRenderer.fillText(ctx, value, x, y);
      } else {
        remaining = value.slice(0);
        firstWord = true;

        while (remaining.length) {
          sepIndex = remaining.search(/[\n\s]/);

          if (sepIndex > 0) {
            curWord = remaining.slice(0, sepIndex);
            remaining = remaining.slice(sepIndex);
          } else if (sepIndex === 0) {
            curWord = remaining.charAt(0);
            remaining = remaining.slice(1); // returns '' if nothing left
          } else {
            curWord = remaining;
            remaining = '';
          }

          if (curWord !== '\n') {
            xIncr = textRenderer.textWidth(ctx, curWord);

            if (xIncr + lineX > data.wrapAt && !firstWord) {
              lineX = data.wrapToX || x;
              curY += lineHeight;
            }

            textRenderer.fillText(ctx, curWord, lineX, curY);
            lineX += xIncr;
            firstWord = false;
          } else {
            lineX = x;
            curY += lineHeight;
            firstWord = true;
          }
        }
      }

      return curY - y;
    }

    // Get current font size in pixels from canvas context
    function fontSizePx(ctx) {
      var fontArgs = ctx.font.split(' ')
        , size = fontArgs.find(function(part) {
            return part.endsWith('px');
          })

      return parseFloat(size.replace('px', ''));
    }

    function drawImage(ctx, data, image) {
      if (!image) {
        return; // It's possible that an image failed to resolve. It will have been logged there, so just fail silently.
      }

      var targetRatio = (data.width * 1.0) / data.height
        , imageHeight = typeof(image.naturalHeight) === "undefined" ?
            image.height :
            image.naturalHeight
        , imageWidth = typeof(image.naturalWidth) === "undefined" ?
            image.width :
            image.naturalWidth
        , imageRatio = (imageWidth * 1.0) / imageHeight
        , sx = 0
        , sy = 0
        , sWidth = 0
        , sHeight = 0
        , gap = 0
        , imageToDraw = image
        , rotateRad
        , invRotateRad
        , $tmpCanvas
        , tmpCtx
        ;

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
        sHeight -= data.zoomLevel * sHeight / 100;
        sWidth = targetRatio * sHeight;
      }

      if (data.panX) {
        sx += data.panX * sWidth / 300;
      }

      if (data.panY) {
        sy += data.panY * sHeight / 300;
      }

      if (data.rotate || data.flipHoriz || data.flipVert) {
        imageToDraw =
          rotatedImageCache.get(
            image,
            data.id,
            data.rotate || 0,
            data.flipHoriz || false,
            data.flipVert || false,
            imageWidth,
            imageHeight
          );
      }

      ctx.drawImage(
        imageToDraw,
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

      if (data.lineDash) {
        ctx.setLineDash(data.lineDash);
      }

      ctx.beginPath();
      ctx.moveTo(data.startX, data.startY);
      ctx.lineTo(data.endX, data.endY);
      ctx.stroke();

      ctx.setLineDash([]);
    }
  }

  /*
   * Coarse check to see if we're in a Node.js environment or not and export
   * TemplateRenderer accordingly.
   */
  if (typeof module === "undefined") {
    window.TemplateRenderer = TemplateRenderer;
  } else {
    module.exports.new = function(options) {
      return new TemplateRenderer(options);
    }
  }
})();
