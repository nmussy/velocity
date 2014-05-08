    /*******************
      velocity.animate
    *******************/

    /* Simultaneously assign the jQuery plugin function ($elements.velocity()) and the utility alias (velocity.animate(elements)). */
    /* Note: The utility alias allows for the animation of raw (non-jQuery) DOM elements. */
    velocity.animate = function() {

        /**************************
           Arguments Assignment
        **************************/

        /* When Velocity is called via the utility function, elements are explicitly passed in as the first parameter. Thus, argument positioning can vary. We normalize them here. */
        var isElWrapped,
            elements,
            propertiesMap,
            options;

        /* Detect jQuery elements by checking for the "jquery" property on the element or element set. */
        if (this.jquery || (window.Zepto && window.Zepto.zepto.isZ(this))) {
            isElWrapped = true;

            elements = this;
            propertiesMap = arguments[0];
            options = arguments[1];
        /* Otherwise, raw elements are being animated via the utility function. */
        } else {
            isElWrapped = false;

            /* To guard from user errors, extract the raw DOM element from the jQuery object if one was passed in to the utility function. */
            elements = arguments[0].jquery ? arguments[0].get() : arguments[0];
            propertiesMap = arguments[1];
            options = arguments[2];
        }    
     
        /* The length of the targeted element set is defaulted to 1 in case a single raw DOM element is passed in (which doesn't contain a length property). */
        var elementsLength = elements.length || 1,
            elementsIndex = 0;    

        /**********************
           Action Detection
        **********************/

        /* Velocity's behavior is categorized into "actions": Elements can either be specially scrolled into view, or they can be started, stopped, or reversed. If a literal or referenced properties map is passed
           in as Velocity's first argument, the associated action is "start". Alternatively, "scroll", "reverse", or "stop" can be passed in instead of a properties map. */
        var action;

        switch (propertiesMap) {
            case "scroll":
                action = "scroll";
                break;

            case "reverse":
                action = "reverse";
                break;

            case "stop":
                action = "stop";
                break;

            default:
                /* Treat a non-empty plain object as a literal properties map. */
                if ($.isPlainObject(propertiesMap) && !$.isEmptyObject(propertiesMap)) {
                    action = "start";
                /* Check if a string matches a registered sequence (see Sequences above). If so, trigger the sequence for each element in the set to prevent users from having to handle iteration logic in their sequence code. */
                } else if (typeof propertiesMap === "string" && velocity.Sequences[propertiesMap]) {
                    $.each(elements, function(elementIndex, element) {
                        /* Pass in the call's options object so that the sequence can optionally extend it. It defaults to an empty object instead of null to reduce the options checking logic required inside the sequence. */
                        /* Note: The element is passed in as both the call's context and its first argument -- allowing for more expressive sequence declarations. */
                        velocity.Sequences[propertiesMap].call(element, element, options || {}, elementIndex, elementsLength);
                    });

                    /* Since the animation logic resides within the sequence's own code, abort the remainder of this call. (The performance overhead up to this point is virtually non-existant.) */
                    /* Note: The jQuery call chain is kept intact by returning the complete element set. */
                    return elements;
                } else {
                    if (velocity.debug) console.log("First argument was not a property map, a known action, or a registered sequence. Aborting.")
                    
                    return elements;
                }
        }

        /***************************
            Argument Overloading
        ***************************/

        /* Support is included for jQuery's argument overloading: $.animate(propertyMap [, duration] [, easing] [, complete]). Overloading is detected by checking for the absence of an options object.
           The stop action does not accept animation options, and is therefore excluded from this check. */
        /* Note: Although argument overloading is an incredibly sloppy practice in JavaScript, support is included so that velocity() can act as a drop-in replacement for $.animate(). */
        if (propertiesMap !== "stop" && typeof options !== "object") {
            /* The utility function shifts all arguments one position to the right, so we adjust for that offset. */
            var startingArgumentPosition = isElWrapped ? 1 : 2;

            options = {};

            /* Iterate through all options arguments */
            for (var i = startingArgumentPosition; i < arguments.length; i++) {
                /* Treat a number as a duration. Parse it out. */
                if (/^\d/.test(arguments[i])) {
                    options.duration = parseFloat(arguments[i]);
                /* Treat a string as an easing. Trim whitespace. */
                } else if (typeof arguments[i] === "string") {
                    options.easing = arguments[i].replace(/^\s+|\s+$/g, "");
                /* Treat a function as a callback. */
                } else if (isFunction(arguments[i])) {
                    options.complete = arguments[i];
                }
            }
        }

        /**************************
            Call-Wide Variables
        **************************/

        /* A container for CSS unit conversion ratios (e.g. %, rem, and em ==> px) that is used to cache ratios across all properties being animated in a single Velocity call. 
           Calculating unit ratios necessitates DOM querying and updating, and is therefore avoided (via caching) wherever possible; further, ratios are only calculated when they're needed. */
        /* Note: This container is call-wide instead of page-wide to avoid the risk of using stale conversion metrics across Velocity animations that are not immediately consecutively chained. */
        var unitConversionRatios = {
                /* Performance optimization insight: When the parent element, CSS position value, and fontSize do not differ amongst elements, the elements' unit ratios are identical. */
                lastParent: null,
                lastPosition: null,
                lastFontSize: null,
                /* Percent is the only unit types whose ratio is dependant upon axis. */
                lastPercentToPxWidth: null,
                lastPercentToPxHeight: null,
                lastEmToPx: null,
                /* The rem==>px ratio is relative to the document's fontSize -- not any property belonging to the element. Thus, it is automatically call-wide cached whenever the rem unit is being animated. */
                remToPxRatio: null
            };

        /* A container for all the ensuing tween data and metadata associated with this call. This container gets pushed to the page-wide velocity.State.calls array that is processed during animation ticking. */
        var call = [];

        /**********************
           Option: Complete
        **********************/

        /* The complete option must be a function. Otherwise, default to null. */
        /* Note: The complete option is the only option that is processed on a call-wide basis since it is fired once per call -- not once per element. */
        if (options && !isFunction(options.complete)) {
            options.complete = null;
        }

        /************************
           Element Processing
        ************************/ 

        /* Element processing consists of three parts -- data processing that cannot go stale and data processing that *can* go stale (i.e. third-party style modifications):
           1) Pre-Queueing: Element-wide variables, including the element's data storage, are instantiated. 2) Options are prepared for animation. 3) If triggered, the Stop action is executed.
           2) Queueing: The logic that runs once this call has reached its point of execution in the element's $.queue() stack. Most logic is placed here to avoid risking it becoming stale.
           3) Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
        */

        function processElement () {

            /*************************
               Part I: Pre-Queueing
            *************************/

            /***************************
               Element-Wide Variables
            ***************************/

            var element = this,
                /* The runtime opts object is the extension of the current call's options and Velocity's page-wide option defaults. */ 
                opts = $.extend({}, global.velocity.defaults, options),
                /* A container for the processed data associated with each property in the propertyMap. (Each property in the map produces its own "tween".) */
                tweensContainer = {};

            /********************
                Action: Stop
            ********************/

            /* When the stop action is triggered, the elements' remaining queue calls (including loops) are removed, but its in-progress animation runs until completion. This is intentional in order to avoid visually-abrupt stopping. */
            /* Note: The stop command runs prior to Queueing since its behavior is intended to take effect *immediately*, regardless of the targeted element's current state. */
            if (action === "stop") {
                /* Clearing jQuery's $.queue() array is achieved by manually setting it to []. */
                /* Note: To stop only the animations associated with a specific queue, a custom queue name can optionally be provided in place of an options object. */
                $.queue(element, (typeof options === "string") ? options : "", []);

                /* Since we're stopping, do not proceed with Queueing. */
                return true;
            }

            /******************
                Data Cache
            ******************/

            /* A primary design goal of Velocity is to cache data wherever possible in order to avoid DOM requerying. Accordingly, each element has a data cache instantiated on it. */
            if ($.data(element, NAME) === undefined) {
                $.data(element, NAME, {
                    /* Keep track of whether the element is currently being animated by Velocity. This is used to ensure that property values are not transferred between non-consecutive (stale) calls. */
                    isAnimating: false,
                    /* A reference to the element's live computedStyle object. You can learn more about computedStyle here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
                    computedStyle: null,
                    /* Tween data is cached for each animation on the element so that data can be passed across calls -- in particular, end values are used as subsequent start values in consecutive Velocity calls. */
                    tweensContainer: null,
                    /* The full root property values of each CSS hook being animated on this element are cached so that:
                       1) Concurrently-animating hooks sharing the same root can have their root values' merged into one while tweening.
                       2) Post-hook-injection root values can be transferred over to consecutively chained Velocity calls as starting root values.
                    */
                    rootPropertyValueCache: {},
                    /* A cache for transform updates, which must be manually flushed via CSS.flushTransformCache(). */
                    transformCache: {}
                });
            }

            /*********************
               Option: Duration
            *********************/

            /* Support for jQuery's named durations. */
            switch (opts.duration.toString().toLowerCase()) {
                case "fast":
                    opts.duration = 200;
                    break;

                case "normal":
                    opts.duration = 400;
                    break;

                case "slow":
                    opts.duration = 600;
                    break;

                default:
                    /* Remove the value's potential "ms" suffix and default to a non-zero value (which is never intended -- if it actually is intended, the user needs to rethink their animation approach). */
                    opts.duration = parseFloat(opts.duration) || parseFloat(global.velocity.defaults.duration) || 400;
            }

            /********************
               Option: Easing
            ********************/

            /* Ensure that the passed in easing has been assigned to jQuery's velocity.Easings object (which Velocity also uses as its easings container). */
            if (!velocity.Easings[opts.easing]) {
                /* If the passed in easing is not supported, default to the easing in Velocity's page-wide defaults object so long as its supported (it may have been reassigned by the user). */
                if (velocity.Easings[global.velocity.defaults.easing]) {
                    opts.easing = global.velocity.defaults.easing;
                /* Otherwise, revert to default swing */
                } else {
                    opts.easing = "swing";
                }
            }

            /******************
               Option: Delay
            ******************/

            /* Velocity rolls its own delay function since jQuery doesn't have a utility alias for $.fn.delay() (and thus requires jQuery element creation, which we avoid since its overhead includes DOM querying). */
            if (/^\d/.test(opts.delay)) {
                $.queue(element, opts.queue, function(next) {
                    /* This is a flag used to indicate to the upcoming completeCall() function that this queue entry was initiated by Velocity. See completeCall() for further details. */
                    velocity.queueEntryFlag = true;

                    /* The ensuing queue item (which is assigned to the "next" argument that $.queue() automatically passes in) will be triggered after a setTimeout delay. */
                    setTimeout(next, parseFloat(opts.delay));
                });
            }

            /********************
               Option: Display
            ********************/

            /* Refer to Velocity's documentation (VelocityJS.org/#display) for a description of the display option's behavior. */
            if (opts.display) {
                opts.display = opts.display.toLowerCase();
            }

            /**********************
               Option: mobileHA
            **********************/

            /* When set to true, and if this is a mobile device, mobileHA automatically enables hardware acceleration (via a null transform hack) on animating elements. HA is removed from the element at the completion of its animation. */
            /* You can read more about the use of mobileHA in Velocity's documentation: VelocityJS.org/#mobileHA. */
            opts.mobileHA = (opts.mobileHA && velocity.State.isMobile);

            /***********************
               Part II: Queueing
            ***********************/

            /* When a set of elements is targeted by a Velocity call, the set is broken up and each element has the current Velocity call individually queued onto it.
               In this way, each element's existing queue is respected; some elements may already be animating and accordingly should not have this current Velocity call triggered immediately. */
            /* In each queue, tween data is processed for each animating property then pushed onto the call-wide calls array. When the last element in the set has had its tweens processed,
               the call array is pushed to velocity.State.calls for live processing by the requestAnimationFrame tick. */
            $.queue(element, opts.queue, function(next) {
                /* This is a flag used to indicate to the upcoming completeCall() function that this queue entry was initiated by Velocity. See completeCall() for further details. */
                velocity.queueEntryFlag = true;

                /*******************
                   Option: Begin
                *******************/

                /* The begin callback is fired once per call -- not once per elemenet -- and is passed the full element set as both its context and its first argument. */
                if (elementsIndex === 0 && options && isFunction(options.begin)) {
                    options.begin.call(elements, elements);
                }

                /*****************************************
                   Tween Data Construction (for Scroll)
                *****************************************/

                /* Note: In order to be subjected to chaining and animation options, scroll's tweening is routed through Velocity as if it were a standard CSS property animation. */
                if (action === "scroll") {   
                    /* The scroll action uniquely takes an optional "offset" option -- specified in pixels -- that offsets the targeted scroll position. */
                    var scrollOffset = parseFloat(opts.offset) || 0,
                        scrollPositionCurrent,
                        scrollPositionEnd;

                    /* Scroll also uniquely takes an optional "container" option, which indicates the parent element that should be scrolled -- as opposed to the browser window itself.
                       This is useful for scrolling toward an element that's inside an overflowing parent element. */
                    if (opts.container) {
                        /* Ensure that either a jQuery object or a raw DOM element was passed in. */
                        if (opts.container.jquery || opts.container.nodeType) {
                            /* Extract the raw DOM element from the jQuery wrapper. */
                            opts.container = opts.container[0] || opts.container;
                            /* Note: Unlike all other properties in Velocity, the browser's scroll position is never cached since it so frequently changes (due to the user's natural interaction with the page). */
                            scrollPositionCurrent = opts.container.scrollTop; /* GET */

                            /* $.position() values are relative to the container's currently viewable area (without taking into account the container's true dimensions -- say, for example, if the container was not overflowing).
                               Thus, the scroll end value is the sum of the child element's position *and* the scroll container's current scroll position. */
                            /* Note: jQuery does not offer a utility alias for $.position(), so we have to incur jQuery object conversion here. This syncs up with an ensuing batch of GETs, so it fortunately does not produce layout thrashing. */
                            scrollPositionEnd = (scrollPositionCurrent + $(element).position().top) + scrollOffset; /* GET */
                        /* If a value other than a jQuery object or a raw DOM element was passed in, default to null so that this option is ignored. */
                        } else {
                            opts.container = null;
                        }
                    } else {
                        /* If the window itself is being scrolled -- not a containing element -- perform a live scroll position lookup using the appropriate cached property names (which differ based on browser type). */
                        scrollPositionCurrent = velocity.State.scrollAnchor[velocity.State.scrollProperty]; /* GET */

                        /* Unlike $.position(), $.offset() values are relative to the browser window's true dimensions -- not merely its currently viewable area -- and therefore end values do not need to be compounded onto current values. */
                        scrollPositionEnd = $(element).offset().top + scrollOffset; /* GET */
                    }

                    /* Since there's only one format that scroll's associated tweensContainer can take, we create it manually. */
                    tweensContainer = {
                        scroll: {
                            rootPropertyValue: false,
                            startValue: scrollPositionCurrent,
                            currentValue: scrollPositionCurrent,
                            endValue: scrollPositionEnd,
                            unitType: "",
                            easing: opts.easing,
                            scrollContainer: opts.container
                        },
                        element: element
                    };

                /******************************************
                   Tween Data Construction (for Reverse)
                ******************************************/

                /* Reverse acts like a "start" action in that a property map is animated toward. The only difference is that the property map used for reverse is the inverse of the map used in the previous call.
                   Thus, we manipulate the previous call to construct our new map: use the previous map's end values as our new map's start values. Copy over all other data. */ 
                /* Note: Reverse can be directly called via the "reverse" parameter, or it can be indirectly triggered via the loop option. (Loops are composed of multiple reverses.) */
                /* Note: Reverse calls do not need to be consecutively chained onto a currently-animating element in order to operate on cached values; there is no harm to reverse being called on a potentially stale data cache since
                   reverse's behavior is simply defined as reverting to the element's values as they were prior to the previous *Velocity* call. */
                } else if (action === "reverse") {   
                    /* Abort if there is no prior animation data to reverse to. */
                    if (!$.data(element, NAME).tweensContainer) {
                        /* Dequeue the element so that this queue entry releases itself immediately, allowing subsequent queue entries to run. */
                        $.dequeue(element, opts.queue);

                        return;
                    } else {
                        /*********************
                           Options Parsing
                        *********************/

                        /* If the element was hidden via the display option in the previous call, revert display to block prior to reversal so that the element is visible again. */
                        if ($.data(element, NAME).opts.display === "none") {
                            $.data(element, NAME).opts.display = "block";
                        }

                        /* If the loop option was set in the previous call, disable it so that reverse calls aren't recursively generated. */
                        $.data(element, NAME).opts.loop = false;

                        /* The opts object used for reversal is an extension of the options object optionally passed into this reverse call plus the options used in the previous Velocity call. */
                        opts = $.extend({}, $.data(element, NAME).opts, options);

                        /*************************************
                           Tweens Container Reconstruction
                        *************************************/

                        /* Create a deepy copy (indicated via the true flag) of the previous call's tweensContainer. */
                        var lastTweensContainer = $.extend(true, {}, $.data(element, NAME).tweensContainer);   

                        /* Manipulate the previous tweensContainer by replacing its end values and currentValues with its start values. */
                        for (var lastTween in lastTweensContainer) {
                            /* In addition to tween data, tweensContainers contain an element property that we ignore here. */
                            if (lastTween !== "element") {
                                var lastStartValue = lastTweensContainer[lastTween].startValue;

                                lastTweensContainer[lastTween].startValue = lastTweensContainer[lastTween].currentValue = lastTweensContainer[lastTween].endValue;
                                lastTweensContainer[lastTween].endValue = lastStartValue;

                                /* Easing is the only call option that embeds into the individual tween data since it can be defined on a per-property basis. Accordingly, every property's easing value must
                                   be updated when an options object is passed in with a reverse call. The side effect of this extensibility is that all per-property easing values are forcefully reset to the new value. */
                                if (options) {
                                    lastTweensContainer[lastTween].easing = opts.easing;
                                }
                            }
                        }

                        tweensContainer = lastTweensContainer;
                    }

                /*****************************************
                   Tween Data Construction (for Start)
                *****************************************/

                } else if (action === "start") {

                    /*************************
                        Value Transferring
                    *************************/

                    /* If this queue entry follows a previous Velocity-initiated queue entry *and* if this entry was created while the element was in the process of being animated by Velocity, then this current call
                       is safe to use the end values from the prior call as its start values. Velocity attempts to perform this value transfer process whenever possible in order to avoid requerying the DOM. */
                    /* If values aren't transferred from a prior call and start values were not forcefed by the user (more on this below), then the DOM is queried for the element's current values as a last resort. */
                    /* Note: Conversely, animation reversal (and looping) *always* perform inter-call value transfers; they never requery the DOM. */
                    var lastTweensContainer;

                    /* The per-element isAnimating flag is used to indicate whether it's safe (i.e. the data isn't stale) to transfer over end values to use as start values. If it's set to true and there is a previous 
                       Velocity call to pull values from, do so. */
                    if ($.data(element, NAME).tweensContainer && $.data(element, NAME).isAnimating === true) {
                        lastTweensContainer = $.data(element, NAME).tweensContainer;
                    }

                    /***************************
                       Tween Data Calculation   
                    ***************************/

                    /* This function parses property data and defaults endValue, easing, and startValue as appropriate. */
                    /* Property map values can either take the form of 1) a single value representing the end value, or 2) an array in the form of [ endValue, [, easing] [, startValue] ].
                       The optional third parameter is a forcefed startValue to be used instead of querying the DOM for the element's current value. Read Velocity's docmentation to learn more about forcefeeding: VelocityJS.org/#forcefeeding */
                    function parsePropertyValue (valueData) {
                        var endValue = undefined,
                            easing = undefined,
                            startValue = undefined;

                        /* Handle the array format, which can be structured as one of three potential overloads: A) [ endValue, easing, startValue ], B) [ endValue, easing ], or C) [ endValue, startValue ] */
                        if (Object.prototype.toString.call(valueData) === "[object Array]") {
                            /* endValue is always the first item in the array. Don't bother validating endValue's value now since the ensuing property cycling logic inherently does that. */
                            endValue = valueData[0];

                            /* Two-item array format: If the second item is a number or a function, treat it as a start value since easings can only be strings. */
                            if (/^[\d-]/.test(valueData[1]) || isFunction(valueData[1])) {
                                startValue = valueData[1];
                            /* Two or three-item array: If the second item is a string, treat it as an easing. */
                            } else if (typeof valueData[1] === "string") {
                                /* Only use this easing if it's been registered on velocity.Easings. */
                                if (velocity.Easings[valueData[1]] !== undefined) {
                                    easing = valueData[1];
                                }

                                /* Don't bother validating startValue's value now since the ensuing property cycling logic inherently does that. */
                                if (valueData[2]) {
                                    startValue = valueData[2];
                                }
                            }
                        /* Handle the single-value format. */
                        } else {
                            endValue = valueData;
                        }

                        /* Default to the call's easing if a per-property easing type was not defined. */ 
                        easing = easing || opts.easing;

                        /* If functions were passed in as values, pass the function the current element as its context, plus the element's index and the element set's size as arguments. Then, assign the returned value. */
                        if (isFunction(endValue)) {
                            endValue = endValue.call(element, elementsIndex, elementsLength);
                        }

                        if (isFunction(startValue)) {
                            startValue = startValue.call(element, elementsIndex, elementsLength);
                        }

                        /* Allow startValue to be left as undefined to indicate to the ensuing code that its value was not forcefed. */
                        return [ endValue || 0, easing, startValue ];
                    }

                    /* Create a tween out of each property, and append its associated data to tweensContainer. */
                    for (var property in propertiesMap) {
                        /* Normalize property names via camel casing so that properties can be consistently manipulated. */
                        /**************************
                           Start Value Sourcing
                        **************************/

                        /* Parse out endValue, easing, and startValue from the property's data. */
                        var valueData = parsePropertyValue(propertiesMap[property]),
                            endValue = valueData[0],
                            easing = valueData[1],
                            startValue = valueData[2];

                        /* Now that the original property name's format has been used for the parsePropertyValue() lookup above, we force the property to its camelCase styling to normalize it for manipulation. */
                        property = CSS.Names.camelCase(property);

                        /* In case this property is a hook, there are circumstances where we will intend to work on the hook's root property and not the hooked subproperty. */
                        var rootProperty = CSS.Hooks.getRoot(property),
                            rootPropertyValue = false;

                        /* Properties that are not supported by the browser (and do not have an associated normalization) will inherently produce no style changes when set, so they are skipped in order to decrease animation tick overhead. 
                           Property support is determined via prefixCheck(), which returns a false flag when no supported is detected. */ 
                        if (CSS.Names.prefixCheck(rootProperty)[1] === false && CSS.Normalizations.registered[rootProperty] === undefined) {
                            if (velocity.debug) console.log("Skipping [" + rootProperty + "] due to a lack of browser support.");

                            continue;           
                        }

                        /* If the display option is being set to a non-"none" (e.g. "block") and opacity (filter on IE<=8) is being animated to an endValue of non-zero, the user's intention is to fade in from invisible, 
                           thus we forcefeed opacity a startValue of 0 if its startValue hasn't already been sourced by value transferring or prior forcefeeding. */
                        if ((opts.display && opts.display !== "none") && /opacity|filter/.test(property) && !startValue && endValue !== 0) {
                            startValue = 0;
                        }

                        /* If values have been transferred from the previous Velocity call, extract the endValue and rootPropertyValue for all of the current call's properties that were *also* animated in the previous call. */
                        /* Note: Value transferring can optionally be disabled by the user via the _cacheValues option. */
                        if (opts._cacheValues && lastTweensContainer && lastTweensContainer[property]) {
                            if (startValue === undefined) {
                                startValue = lastTweensContainer[property].endValue + lastTweensContainer[property].unitType;
                            }
                                    
                            /* The previous call's rootPropertyValue is extracted from the element's data cache since that's the instance of rootPropertyValue that gets freshly updated by the tweening process,
                               whereas the rootPropertyValue attached to the incoming lastTweensContainer is equal to the root property's value prior to any tweening. */
                            rootPropertyValue = $.data(element, NAME).rootPropertyValueCache[rootProperty];
                        /* If values were not transferred from a previous Velocity call, query the DOM as needed. */
                        } else {
                            /* Handle hooked properties. */
                            if (CSS.Hooks.registered[property]) {
                               if (startValue === undefined) {
                                    rootPropertyValue = CSS.getPropertyValue(element, rootProperty); /* GET */
                                    /* Note: The following getPropertyValue() call does not actually trigger a DOM query; getPropertyValue() will extract the hook from rootPropertyValue. */
                                    startValue = CSS.getPropertyValue(element, property, rootPropertyValue);
                                /* If startValue is already defined via forcefeeding, do not query the DOM for the root property's value; just grab rootProperty's zero-value template from CSS.Hooks. This overwrites the element's actual
                                   root property value (if one is set), but this is acceptable since the primary reason users forcefeed is to avoid DOM queries, and thus we likewise avoid querying the DOM for the root property's value. */
                                } else {
                                    /* Grab this hook's zero-value template, e.g. "0px 0px 0px black". */
                                    rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                                }
                            /* Handle non-hooked properties that haven't already been defined via forcefeeding. */
                            } else if (startValue === undefined) {
                                startValue = CSS.getPropertyValue(element, property); /* GET */
                            }
                        }

                        /**************************
                           Value Data Extraction
                        **************************/

                        var separatedValue,
                            endValueUnitType,
                            startValueUnitType,
                            operator;

                        /* Separates a property value into its numeric value and its unit type. */
                        function separateValue (property, value) {
                            var unitType,
                                numericValue;

                            numericValue = (value || 0)
                                .toString()
                                .toLowerCase()
                                /* Match the unit type at the end of the value. */
                                .replace(/[%A-z]+$/, function(match) { 
                                    /* Grab the unit type. */
                                    unitType = match;

                                    /* Strip the unit type off of value. */
                                    return "";
                                });

                            /* If no unit type was supplied, assign one that is appropriate for this property (e.g. "deg" for rotateZ or "px" for width). */
                            if (!unitType) {
                                unitType = CSS.Values.getUnitType(property);
                            }

                            return [ numericValue, unitType ];
                        }

                        /* Separate startValue. */
                        separatedValue = separateValue(property, startValue);
                        startValue = separatedValue[0];
                        startValueUnitType = separatedValue[1];

                        /* Separate endValue, and extract a value operator (e.g. "+=", "-=") if one exists. */
                        separatedValue = separateValue(property, endValue);
                        endValue = separatedValue[0].replace(/^([+-\/*])=/, function(match, subMatch) {
                            operator = subMatch;

                            /* Strip the operator off of the value. */
                            return "";
                        });
                        endValueUnitType = separatedValue[1];     

                        /* Parse float values from endValue and startValue. Default to 0 if NaN is returned. */
                        startValue = parseFloat(startValue) || 0;
                        endValue = parseFloat(endValue) || 0;

                        /*****************************
                           Value & Unit Conversion
                        *****************************/

                        var elementUnitRatios;

                        /* Custom support for properties that don't actually accept the % unit type, but where pollyfilling is trivial and relatively foolproof. */
                        if (endValueUnitType === "%") {
                            /* A %-value fontSize/lineHeight is relative to the parent's fontSize (as opposed to the parent's dimensions), which is identical to the em unit's behavior, so we piggyback off of that. */
                            if (/^(fontSize|lineHeight)$/.test(property)) {
                                /* Convert % into an em decimal value. */ 
                                endValue = endValue / 100;
                                endValueUnitType = "em";
                            /* For scaleX and scaleY, convert the value into its decimal format and strip off the unit type. */ 
                            } else if (/^scale/.test(property)) {
                                endValue = endValue / 100;
                                endValueUnitType = "";
                            /* For RGB components, take the defined percentage of 255 and strip off the unit type. */ 
                            } else if (/(Red|Green|Blue)$/i.test(property)) {
                                endValue = (endValue / 100) * 255;
                                endValueUnitType = "";
                            }
                        } 

                        /* When queried, the browser returns (most) CSS property values in pixels. Therefore, if an endValue of %, em, or rem is animated toward, startValue must be converted from pixels into the same unit type 
                           as endValue in order for value manipulation logic to proceed. Further, if the startValue was forcefed or transferred from a previous call, its value may not actually be in pixels. Unit conversion logic
                           consists of two steps: 1) Calculating the ratio of %, em, and rem relative to pixels, and 2) Matching up startValue's unit type with endValue's based on these ratios. */
                        /* Unit conversion ratios are calculated by momentarily setting a value with the target unit type on the element, comparing the returned pixel value, then reverting to the original value. */
                        /* Note: Even if only one of these unit types is being animated, all unit ratios are calculated at once since the overhead of batching the SETs and GETs together upfront outweights the potential overhead
                                 of layout thrashing caused by re-querying for uncalculated ratios for subsequently-processed properties. */
                        /* Todo: Shift this logic into the calls' first tick instance so that it's synced with RAF. */
                        /* Todo: Store the original values and skip re-setting if we're animating height or width in the properties map. */
                        function calculateUnitRatios () {
                            /* The properties below are used to determine whether the element differs sufficiently from this call's prior element to also differ in its unit conversion ratio.
                               If the properties match up with those of the prior element, the prior element's conversion ratios are used. Like most optimizations in Velocity, this is done to minimize DOM querying. */
                            var sameRatioIndicators = {
                                    parent: element.parentNode, /* GET */
                                    position: CSS.getPropertyValue(element, "position"), /* GET */
                                    fontSize: CSS.getPropertyValue(element, "fontSize") /* GET */
                                },
                                /* Determine if the same % ratio can be used. % is relative to the element's position and the parent's dimensions. */
                                sameBasePercent = ((sameRatioIndicators.position === unitConversionRatios.lastPosition) && (sameRatioIndicators.parent === unitConversionRatios.lastParent)),
                                /* Determine if the same em ratio can be used. em is relative to the element's fontSize. */
                                sameBaseEm = (sameRatioIndicators.fontSize === unitConversionRatios.lastFontSize);

                            /* Store these ratio indicators call-wide for the next element to compare against. */
                            unitConversionRatios.lastParent = sameRatioIndicators.parent;
                            unitConversionRatios.lastPosition = sameRatioIndicators.position;
                            unitConversionRatios.lastFontSize = sameRatioIndicators.fontSize;

                            /* Whereas % and em ratios are determined on a per-element basis, the rem unit type only needs to be checked once per call since it is exclusively dependant upon the body element's fontSize.
                               If this is the first time that calculateUnitRatios() is being run during this call, the remToPxRatio value will be null, so we calculate it now. */
                            if (unitConversionRatios.remToPxRatio === null) {
                                /* Default to most browsers' default fontSize of 16px in the case of 0. */
                                unitConversionRatios.remToPxRatio = parseFloat(CSS.getPropertyValue(document.body, "fontSize")) || 16; /* GET */
                            }

                            var originalValues = {
                                    /* To accurately and consistently calculate conversion ratios, the element's overflow and box-sizing are temporarily disabled. Overflow must be manipulated on a per-axis basis
                                       since the plain overflow property overwrites its subproperties' values. */
                                    overflowX: null,
                                    overflowY: null,
                                    boxSizing: null,
                                    /* width and height act as our proxy properties for measuring the horizontal and vertical % ratios. Since they can be artificially constrained by their min-/max- equivalents, those properties are changed as well. */
                                    width: null,
                                    minWidth: null,
                                    maxWidth: null,
                                    height: null,
                                    minHeight: null,
                                    maxHeight: null,
                                    /* paddingLeft acts as our proxy for the em ratio. */
                                    paddingLeft: null
                                },
                                elementUnitRatios = {},
                                /* Note: IE<=8 round to the nearest pixel when returning CSS values, thus we perform conversions using a measurement of 10 (instead of 1) to give our ratios a precision of at least 1 decimal value. */
                                measurement = 10;                                

                            /* For organizational purposes, active ratios calculations are consolidated onto the elementUnitRatios object. */
                            elementUnitRatios.remToPxRatio = unitConversionRatios.remToPxRatio;

                            /* Note: To minimize layout thrashing, the ensuing unit conversion logic is split into batches to synchronize GETs and SETs. */
                            originalValues.overflowX = CSS.getPropertyValue(element, "overflowX"); /* GET */
                            originalValues.overflowY = CSS.getPropertyValue(element, "overflowY"); /* GET */
                            originalValues.boxSizing = CSS.getPropertyValue(element, "boxSizing"); /* GET */

                            /* Since % values are relative to their respective axes, ratios are calculated for both width and height. In contrast, only a single ratio is required for rem and em. */
                            /* When calculating % values, we set a flag to indiciate that we want the computed value instead of offsetWidth/Height, which incorporate additional dimensions (such as padding and border-width) into their values. */
                            originalValues.width = CSS.getPropertyValue(element, "width", null, true); /* GET */
                            originalValues.minWidth = CSS.getPropertyValue(element, "minWidth"); /* GET */
                            /* Note: max-width/height must default to "none" when 0 is returned, otherwise the element cannot have its width/height set. */
                            originalValues.maxWidth = CSS.getPropertyValue(element, "maxWidth") || "none"; /* GET */

                            originalValues.height = CSS.getPropertyValue(element, "height", null, true); /* GET */
                            originalValues.minHeight = CSS.getPropertyValue(element, "minHeight"); /* GET */
                            originalValues.maxHeight = CSS.getPropertyValue(element, "maxHeight") || "none"; /* GET */

                            originalValues.paddingLeft = CSS.getPropertyValue(element, "paddingLeft"); /* GET */

                            if (sameBasePercent) {
                                elementUnitRatios.percentToPxRatioWidth = unitConversionRatios.lastPercentToPxWidth;
                                elementUnitRatios.percentToPxRatioHeight = unitConversionRatios.lastPercentToPxHeight;
                            } else {
                                CSS.setPropertyValue(element, "overflowX",  "hidden"); /* SET */
                                CSS.setPropertyValue(element, "overflowY",  "hidden"); /* SET */
                                CSS.setPropertyValue(element, "boxSizing",  "content-box"); /* SET */

                                CSS.setPropertyValue(element, "width", measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "minWidth", measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "maxWidth", measurement + "%"); /* SET */

                                CSS.setPropertyValue(element, "height",  measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "minHeight",  measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "maxHeight",  measurement + "%"); /* SET */
                            }

                            if (sameBaseEm) {
                                elementUnitRatios.emToPxRatio = unitConversionRatios.lastEmToPx;
                            } else {
                                CSS.setPropertyValue(element, "paddingLeft", measurement + "em"); /* SET */
                            }

                            /* The following pixel-value GETs cannot be batched with the prior GETs since they depend upon the values temporarily set immediately above; layout thrashing cannot be avoided here. */
                            if (!sameBasePercent) {
                                /* Divide the returned value by the measurement value to get the ratio between 1% and 1px. */
                                elementUnitRatios.percentToPxRatioWidth = unitConversionRatios.lastPercentToPxWidth = (parseFloat(CSS.getPropertyValue(element, "width", null, true)) || 0) / measurement; /* GET */
                                elementUnitRatios.percentToPxRatioHeight = unitConversionRatios.lastPercentToPxHeight = (parseFloat(CSS.getPropertyValue(element, "height", null, true)) || 0) / measurement; /* GET */
                            }

                            if (!sameBaseEm) {
                                elementUnitRatios.emToPxRatio = unitConversionRatios.lastEmToPx = (parseFloat(CSS.getPropertyValue(element, "paddingLeft")) || 0) / measurement; /* GET */
                            }

                            /* Revert each test property to its original value. */
                            for (var originalValueProperty in originalValues) {
                                CSS.setPropertyValue(element, originalValueProperty, originalValues[originalValueProperty]); /* SETs */
                            }

                            if (velocity.debug >= 1) console.log("Unit ratios: " + JSON.stringify(elementUnitRatios), element);

                            return elementUnitRatios;
                        }

                        /* The * and / operators, which are not passed in with an associated unit, inherently use startValue's unit. Skip value and unit conversion. */
                        if (/[\/*]/.test(operator)) {
                            endValueUnitType = startValueUnitType;
                        /* If startValue and endValue differ in unit type, convert startValue into the same unit type as endValue so that if endValueUnitType is a relative unit (%, em, rem), the values set during tweening will continue
                           to be accurately relative even if the metrics they depend on are dynamically changing during the course of the animation. Conversely, if we always normalized into px and used px for setting values, the px ratio
                           would become stale if the original unit being animated toward was relative and the underlying metrics change during the animation. */
                        /* Since 0 is 0 in any unit type, no conversion is necessary when startValue is 0 -- we just start at 0 with endValueUnitType. */
                        } else if ((startValueUnitType !== endValueUnitType) && startValue !== 0) {                            
                            /* Unit conversion is also skipped when endValue is 0, but *startValueUnitType* must be used in this case for tween values to remain accurate. */
                            /* Note: Skipping unit conversion here means that if endValueUnitType was originally a relative unit, the animation won't relatively match the underlying metrics if they change, but this is acceptable
                               since we're animating toward invisibility instead of toward visibility that remains past the point of the animation's completion. */ 
                            if (endValue === 0) {
                                endValueUnitType = startValueUnitType;
                            } else { 
                                /* By this point, we cannot avoid unit conversion (it's undesirable since it causes layout thrashing). If we haven't already, we trigger calculateUnitRatios(), which runs once per element per call. */
                                elementUnitRatios = elementUnitRatios || calculateUnitRatios();

                                /* The following RegEx matches CSS properties that have their % values measured relative to the x-axis. */
                                /* Note: W3C spec mandates that all of margin and padding's properties (even top and bottom) are %-relative to the *width* of the parent element, so they're included in this expression. */
                                var axis = (/margin|padding|left|right|width|text|word|letter/i.test(property) || /X$/.test(property)) ? "x" : "y";

                                /* In order to avoid generating n^2 bespoke conversion functions, unit conversion is a two-step process: 1) Convert startValue into pixels. 2) Convert this new pixel value into endValue's unit type. */
                                switch (startValueUnitType) {
                                    case "%":
                                        /* Note: translateX and translateY are the only properties that are %-relative to an element's own dimensions -- not its parent's dimensions. Velocity does not include a special conversion process
                                           for these properties due of the additional DOM overhead it would entail. Therefore, animating translateX/Y from a % value to a non-% value will produce an incorrect start value. Fortunately, 
                                           this sort of cross-unit conversion is rarely done by users in practice. */
                                        startValue *= (axis === "x" ? elementUnitRatios.percentToPxRatioWidth : elementUnitRatios.percentToPxRatioHeight); 
                                        break;

                                    case "em":
                                        startValue *= elementUnitRatios.emToPxRatio;
                                        break;

                                    case "rem":
                                        startValue *= elementUnitRatios.remToPxRatio;
                                        break;

                                    case "px":
                                        /* px acts as our midpoint in the unit conversion process; do nothing. */
                                        break;
                                }

                                /* Invert the px ratios to convert into to the target unit. */
                                switch (endValueUnitType) {
                                    case "%":
                                        startValue *= 1 / (axis === "x" ? elementUnitRatios.percentToPxRatioWidth : elementUnitRatios.percentToPxRatioHeight); 
                                        break;

                                    case "em":
                                        startValue *= 1 / elementUnitRatios.emToPxRatio;
                                        break;

                                    case "rem":
                                        startValue *= 1 / elementUnitRatios.remToPxRatio;
                                        break;

                                    case "px":
                                        /* startValue is already in px, do nothing; we're done. */
                                        break;
                                }
                            }
                        }

                        /***********************
                            Value Operators
                        ***********************/

                        /* Operator logic must be performed last since it requires unit-normalized start and end values. */
                        /* Note: Relative percent values do not behave how most people think; while one would expect "+=50%" to increase the property 1.5x its current value, it in fact increases the percent units in absolute terms:
                                 50 points is added on top of the current % value. */
                        switch (operator) {
                            case "+":
                                endValue = startValue + endValue;
                                break;

                            case "-":
                                endValue = startValue - endValue;
                                break;

                            case "*":
                                endValue = startValue * endValue;
                                break;

                            case "/":
                                endValue = startValue / endValue;
                                break;
                        }

                        /**************************
                           tweensContainer Push
                        **************************/

                        /* Construct the per-property tween object, and push it to the element's tweensContainer. */
                        tweensContainer[property] = {
                            rootPropertyValue: rootPropertyValue,
                            startValue: startValue,
                            currentValue: startValue,
                            endValue: endValue,
                            unitType: endValueUnitType,
                            easing: easing
                        };

                        if (velocity.debug) console.log("tweensContainer (" + property + "): " + JSON.stringify(tweensContainer[property]), element);
                    }

                    /* Along with its property data, store a reference to the element itself onto tweensContainer. */
                    tweensContainer.element = element;
                }

                /***************
                    Pushing
                ***************/

                /* Note: tweensContainer can be empty if all of the properties in this call's property map were skipped due to not being supported by the browser.
                   The element property is used as a proxy for checking that the tweensContainer has been appended to. */
                if (tweensContainer.element) {

                    /*****************
                        Call Push
                    *****************/

                    /* The call array houses the tweensContainers for each element being animated in the current call. */
                    call.push(tweensContainer);

                    /* Store on the element its tweensContainer plus the current call's opts so that Velocity can reference this data the next time this element is animated. */
                    $.data(element, NAME).tweensContainer = tweensContainer;
                    $.data(element, NAME).opts = opts;
                    /* Switch on the element's animating flag. */
                    $.data(element, NAME).isAnimating = true;

                    /******************
                        Calls Push
                    ******************/

                    /* Once the final element in this call's targeted element set has been processed, push the call array onto velocity.State.calls for the animation tick to immediately begin processing. */
                    if (elementsIndex === elementsLength - 1) {
                        /* To speed up iterating over this array, it is compacted (falsey items -- calls that have completed -- are removed) when its length has ballooned to a point that can impact tick performance. 
                           This only becomes necessary when animation has been continuous with many elements over a long period of time; whenever all active calls are completed, completeCall() clears velocity.State.calls. */
                        if (velocity.State.calls.length > 10000) {
                            velocity.State.calls = compactSparseArray(velocity.State.calls);
                        }

                        /* Add the current call plus its associated metadata (the element set and the call's options) onto the page-wide call container. Anything on this call container is subjected to tick() processing. */
                        velocity.State.calls.push([ call, elements, opts ]);

                        /* If the animation tick isn't currently running, start it. (Velocity shuts the tick off when there are no active calls to process.) */
                        if (velocity.State.isTicking === false) {
                            velocity.State.isTicking = true;

                            /* Start the tick loop. */
                            tick();
                        }
                    } else {
                        elementsIndex++;
                    }
                }

                /* jQuery's $.queue() behavior requires calls on a *custom* queue to be explicitly dequeued; non-custom queues have their entries dequeued automatically. */
                /* Note: An empty queue name is an alias for the "fx" queue, which is jQuery's default queue. */
                if (opts.queue !== "" && opts.queue !== "fx") { 
                    /* Fire the next queue entry once this queue has completed. This queue's running time is the sum of the current call's duration and delay options. */
                    setTimeout(next, opts.duration + opts.delay);
                }
            });

            /*********************
                Auto-Dequeuing
            *********************/

            /* As per jQuery's $.queue() behavior, to fire the first non-custom-queue entry on an element, the element must be dequeued if its queue stack consists *solely* of the current call.
               (This can be determined by checking for the "inprogress" item that jQuery prepends to active queue stack arrays.) Otherwise, whenever the element's queue is further appended with 
               additional items -- including $.delay()'s or even $.animate() calls, the queue's first entry is automatically fired. This behavior contrasts that of custom queues, which never auto-fire. */
            /* The queue option may alternatively be set to false, which results in an immediate triggering; chain waiting is skipped entirely, and the targeted call runs in parallel with any currently-running queue entries. */
            /* Note: When an element set is being subjected to a non-parallel Velocity call, the animation will not begin until each one of the elements in the set has reached the end of its individually pre-existing queue chain. */
            /* Note: Unfortunately, most people don't fully grasp jQuery's powerful, yet quirky, $.queue() function. Lean more here: http://stackoverflow.com/questions/1058158/can-somebody-explain-jquery-queue-to-me */
            if (opts.queue === false || ((opts.queue === "" || opts.queue === "fx") && $.queue(element)[0] !== "inprogress")) {                
                $.dequeue(element);
            }            
        }

        /**************************
           Element Set Iteration
        **************************/ 

        /* Determine elements' type, then individually process each element in the set via processElement(). */
        if (isElWrapped) {
            elements.each(processElement);
        /* Check if this is a single raw DOM element by sniffing for a nodeType property. */
        } else if (elements.nodeType) {
            processElement.call(elements);
        /* Otherwise, check if this is an array of raw DOM elements, in which case just sniff the first item's nodeType as a proxy for the remainder. */
        } else if (elements[0] && elements[0].nodeType) {
            for (var rawElementsIndex in elements) {
                processElement.call(elements[rawElementsIndex]);
            }
        }

        /******************
           Option: Loop 
        ******************/

        /* The loop option accepts an integer indicating how many times the element should loop between the values in the current call's properties map and the element's property values prior to this call. */
        /* The loop option's logic is performed here -- after element processing -- because the current call needs to undergo its queue insertion prior to the loop option generating its series of constituent "reverse" calls,
           which chain after the current call. Two reverse calls (two "alternations") constitute one loop. */
        var opts = $.extend({}, global.velocity.defaults, options);
        opts.loop = parseInt(opts.loop);

        if (opts.loop) {
            /* Double the loop count to convert it into its appropriate number of "reverse" calls. Subtract 1 from the resulting value since the current call is included in the total alternation count. */
            for (var x = 0; x < (opts.loop * 2) - 1; x++) {
                /* Since the logic for the reverse action occurs inside Queueing and thus this call's options object isn't parsed until then as well, the current call's delay option must be explicitly passed
                   into the reverse call so that the delay logic that occurs inside *Pre-Queueing* can process this delay. */
                if (isElWrapped) {
                    elements.velocity("reverse", { delay: opts.delay });
                } else {
                    velocity.animate(elements, "reverse", { delay: opts.delay });
                }
            }
        }

        /**************
           Chaining
        **************/

        /* Return the processed elements back to the call chain. */
        return elements;
    };