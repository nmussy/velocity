    /*********************
       Helper Functions
    *********************/

    /* IE detection. Gist: https://gist.github.com/julianshapiro/9098609 */
    var IE = (function() { 
        if (document.documentMode) {
            return document.documentMode;
        } else {
            for (var i = 7; i > 4; i--) {
                var div = document.createElement("div");

                div.innerHTML = "<!--[if IE " + i + "]><span></span><![endif]-->";

                if (div.getElementsByTagName("span").length) {
                    div = null;

                    return i;
                }
            }
        }

        return undefined;
    })();

    /* RAF polyfill. Gist: https://gist.github.com/julianshapiro/9497513 */
    var requestAnimationFrame = window.requestAnimationFrame || (function() { 
        var timeLast = 0;

        return window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) {                
            var timeCurrent = (new Date()).getTime(),
                timeDelta;

            /* Dynamically set delay on a per-tick basis to match 60fps. */
            /* Technique by Erik Moller. MIT license: https://gist.github.com/paulirish/1579671 */
            timeDelta = Math.max(0, 16 - (timeCurrent - timeLast));
            timeLast = timeCurrent + timeDelta;

            return setTimeout(function() { callback(timeCurrent + timeDelta); }, timeDelta);
        };
    })();

    /* Sparse array compacting. Copyright Lo-Dash. MIT License: https://github.com/lodash/lodash/blob/master/LICENSE.txt */
    function compactSparseArray (array) {
        var index = -1,
            length = array ? array.length : 0,
            result = [];

        while (++index < length) {
            var value = array[index];

            if (value) {
                result.push(value);
            }
        }

        return result;
    }

    /* Determine if a variable is a function. */
    function isFunction(variable) {
        return Object.prototype.toString.call(variable) === "[object Function]";
    }
    
    /*****************************
       Tick (Calls Processing)
    *****************************/

    /* Note: There is only a single tick() instance; all calls to Velocity are pushed to the velocity.State.calls array, which is fully iterated through upon each tick. */
    function tick (timestamp) {
        /* An empty timestamp argument indicates that this is the first tick occurence since ticking was turned on (which implies that this tick wasn't called by itself). We leverage this indicator to fully ignore the first tick pass
           since RAF's initial pass is fired whenever the browser's next tick sync time occurs (whereas subsequent RAF passes are spaced by a timer resolution of ~16ms), which results in the first elements subjected to Velocity
           calls being animated out of sync with any elements animated immediately thereafter. In short, we ignore the first RAF tick pass so that elements being immediately consecutively animated -- instead of simultaneously animated
           by the same Velocity call -- are properly batched into the same initial RAF tick and consequently remain in sync thereafter. */
        if (timestamp) {
            /* We ignore RAF's high resolution timestamp since it can be significantly offset when the browser is under high stress; we opt for choppiness over allowing the browser to drop huge chunks of frames. */
            var timeCurrent = (new Date).getTime();

            /********************
               Call Iteration
            ********************/

            /* Iterate through each active call. */
            for (var i = 0, callsLength = velocity.State.calls.length; i < callsLength; i++) {
                /* When a velocity call is completed, its calls array entry is set to false. Continue on to the next call. */
                if (!velocity.State.calls[i]) {
                    continue;
                }

                /************************
                   Call-Wide Variables
                ************************/
                      
                var callContainer = velocity.State.calls[i],
                    call = callContainer[0],
                    opts = callContainer[2],
                    timeStart = callContainer[3];

                /* If timeStart is undefined, then this is the first time that this call has been processed by tick(). We assign timeStart now so that its value is as close to the real animation start time as possible.
                   (Conversely, had timeStart been defined when this call was added to velocity.State.calls, the delay between that time and now would cause the first few frames of the tween to be skipped since percentComplete is
                   calculated relative to timeStart.) */
                /* Further, subtract 16ms (the approximate resolution of RAF) from the current time value so that the first tick iteration isn't wasted by animating at 0% tween completion,
                   which would produce the same style value as the element's current value. */
                if (!timeStart) {
                    timeStart = velocity.State.calls[i][3] = timeCurrent - 16;
                }

                /* The tween's completion percentage is relative to the tween's start time, not the tween's start value (which would result in unpredictable tween durations since JavaScript's timers are not particularly accurate).
                   Accordingly, we ensure that percentComplete does not exceed 1. */
                var percentComplete = Math.min((timeCurrent - timeStart) / opts.duration, 1);

                /**********************
                   Element Iteration
                **********************/

                /* For every call, iterate through each of the elements in its set. */
                for (var j = 0, callLength = call.length; j < callLength; j++) {

                    var tweensContainer = call[j],
                        element = tweensContainer.element;

                    /* Check to see if this element has been deleted midway through the animation by checking for the continued existence of its data cache. If it's gone, skip animating this element. */
                    if (!$.data(element, NAME)) {
                        continue;
                    }

                    var transformPropertyExists = false;

                    /*********************
                       Display Toggling
                    *********************/

                    /* If the display option is set to non-"none", set it upfront so that the element has a chance to become visible before tweening begins. (Otherwise, display's value is set in completeCall() once the animation has completed.) */
                    if (opts.display && opts.display !== "none") {
                        CSS.setPropertyValue(element, "display", opts.display);

                        /* The display option is only set once -- when its associated call is first ticked through. Accordingly, we set its value to false so that it isn't processed again by tick(). */
                        velocity.State.calls[i][2].display = false;
                    }

                    /************************
                       Property Iteration
                    ************************/

                    /* For every element, iterate through each property. */
                    for (var property in tweensContainer) {
                        /* Note: In addition to property tween data, tweensContainer contains a reference to its associated element. */
                        if (property !== "element") {
                            var tween = tweensContainer[property],
                                lastCurrentValue = tween.currentValue,
                                currentValue;

                            /******************************
                               Current Value Calculation
                            ******************************/

                            /* If this is the last tick pass (if we've reached 100% completion for this tween), ensure that currentValue is explicitly set to its target endValue so that it's not subjected to any rounding. */
                            if (percentComplete === 1) {
                                currentValue = tween.endValue;
                            /* Otherwise, calculate currentValue based on the current delta from startValue. */
                            } else {
                                currentValue = tween.startValue + ((tween.endValue - tween.startValue) * velocity.Easings[tween.easing](percentComplete));
                            }

                            /* If style updating wasn't skipped, store the new currentValue onto the call cache. */
                            tween.currentValue = currentValue;

                            /******************
                               Hooks: Part I
                            ******************/

                            /* For hooked properties, the newly-updated rootPropertyValueCache is cached onto the element so that it can be used for subsequent hooks in this call that are associated with the same root property.
                               If we didn't cache the updated rootPropertyValue, each subsequent update to the root property in this tick pass would reset the previous hook's updates to rootPropertyValue prior to injection. */
                            /* A nice performance byproduct of rootPropertyValue caching is that subsequently chained animations using the same hookRoot but a different hook can use this cached rootPropertyValue. */
                            if (CSS.Hooks.registered[property]) {
                                var hookRoot = CSS.Hooks.getRoot(property),
                                    rootPropertyValueCache = $.data(element, NAME).rootPropertyValueCache[hookRoot];

                                if (rootPropertyValueCache) {
                                    tween.rootPropertyValue = rootPropertyValueCache;
                                }
                            }

                            /*****************
                                DOM Update
                            *****************/

                            /* setPropertyValue() returns an array of the property name and property value post any normalization that may have been performed. */
                            var adjustedSetData = CSS.setPropertyValue(element, property, tween.currentValue + (currentValue === "auto" ? "" : tween.unitType), tween.rootPropertyValue, tween.scrollContainer); /* SET */

                            /*******************
                               Hooks: Part II
                            *******************/
                            
                            /* Now that we have the hook's updated rootPropertyValue (which is the post-processed value provided by the adjustedSetData array), cache it onto the element. */
                            if (CSS.Hooks.registered[property]) {
                                /* Since adjustedSetData contains normalized data ready for DOM updating, the rootPropertyValue needs to be re-extracted from its normalized form. */
                                if (CSS.Normalizations.registered[hookRoot]) {
                                    $.data(element, NAME).rootPropertyValueCache[hookRoot] = CSS.Normalizations.registered[hookRoot]("extract", null, adjustedSetData[1]);
                                } else {
                                    $.data(element, NAME).rootPropertyValueCache[hookRoot] = adjustedSetData[1];
                                }
                            }

                            /***************
                               Transforms
                            ***************/

                            /* Flag whether a transform property is being animated so that flushTransformCache() can be triggered once this tick pass is complete. */
                            if (adjustedSetData[0] === "transform") {
                                transformPropertyExists = true;
                            }
                        }
                    }

                    /****************
                        mobileHA
                    ****************/

                    /* If mobileHA is enabled, set the translate3d transform to null to force hardware acceleration. It's safe to override this property since Velocity doesn't actually support its animation (hooks are used in its place). */
                    if (opts.mobileHA) {
                        /* Don't set the null transform hack if we've already done so. */
                        if ($.data(element, NAME).transformCache.translate3d === undefined) {
                            /* All entries on the transformCache object are concatenated into a single transform string via flushTransformCache(). */
                            $.data(element, NAME).transformCache.translate3d = "(0, 0, 0)";

                            transformPropertyExists = true;
                        } else if (percentComplete === 1) {
                            /* If we've reached the end of the animation, remove the translate3d value while setting transformPropertyExists to true in order to flush this removal change to the DOM. */
                            delete $.data(element, NAME).transformCache.translate3d;

                            transformPropertyExists = true;
                        }
                    }

                    if (transformPropertyExists) {
                        CSS.flushTransformCache(element);
                    }
                }

                /* If this call has finished tweening, pass its index to completeCall() to handle call cleanup. */
                if (percentComplete === 1) {
                    completeCall(i);
                }
            }
        }

        /* Note: completeCall() contains the logic for setting the isTicking flag to false (which occurs when the last active call on velocity.State.calls has completed). */
        if (velocity.State.isTicking) {
            requestAnimationFrame(tick);
        }
    }

    /**********************
        Call Completion
    **********************/

    /* Note: Unlike tick(), which processes all active calls at once, call completion is handled on a per-call basis. */
    function completeCall (callIndex) {
        /* Pull the metadata from the call. */
        var call = velocity.State.calls[callIndex][0],
            elements = velocity.State.calls[callIndex][1],
            opts = velocity.State.calls[callIndex][2];

        var remainingCallsExist = false;

        /*************************
           Element Finalization
        *************************/

        for (var i = 0, callLength = call.length; i < callLength; i++) {
            var element = call[i].element; 

            /* If the display option is set to "none" (meaning the user intends to hide the element), set this value now that the animation is complete. */
            /* Note: The display option is ignored with "reverse" calls, which is what loops are composed of. See reverse's logic for further details. */
            if (opts.display === "none" && opts.loop === false) {
                CSS.setPropertyValue(element, "display", opts.display);
            }

            /* If the element's queue is empty (if only the "inprogress" item is left at position 0) or if its queue is about to run a non-Velocity-initiated entry, turn off the isAnimating flag. 
               A non-Velocity-initiatied queue entry's logic might alter an element's CSS values and thereby cause Velocity's cached value data to go stale. To detect if a queue entry was initiated by Velocity,
               we check for the existence of our special velocity.queueEntryFlag declaration, which minifiers won't rename since the flag is assigned to jQuery's global $ object and thus exists out of Velocity's own scope. */
            if ($.queue(element)[1] === undefined || !/\$\.velocity\.queueEntryFlag/i.test($.queue(element)[1])) {     
                /* The element may have been deleted. Ensure that its data cache still exists before acting on it. */
                if ($.data(element, NAME)) {
                    $.data(element, NAME).isAnimating = false;
                    /* Clear the element's rootPropertyValueCache, which will become stale. */
                    $.data(element, NAME).rootPropertyValueCache = {};
                }
            }

            /* The complete callback is fired once per call -- not once per elemenet -- and is passed the full element set as both its context and its first argument. */
            if ((i === callLength -1) && opts.complete) { 
                opts.complete.call(elements, elements); 
            }

            /* Fire the next call in the queue chain. */
            /* Note: Even if the end of the animation queue has been reached, $.dequeue() must still be called in order to completely clear jQuery's animation queue. */
            $.dequeue(element);
        }

        /************************
           Calls Array Cleanup
        ************************/

        /* Since this call is complete, remove it from velocity.State.calls. For performance reasons, the call is set to false instead of being deleted from the array. Learn more here: http://www.html5rocks.com/en/tutorials/speed/v8/ */
        velocity.State.calls[callIndex] = false;

        /* Iterate through the calls array to determine if this was the last running animation. If so, set a flag to end ticking and clear the calls array. */
        for (var j = 0, callsLength = velocity.State.calls.length; j < callsLength; j++) {
            if (velocity.State.calls[j] !== false) {
                remainingCallsExist = true;

                break;
            }
        }

        if (remainingCallsExist === false) {
            /* tick() will detect this flag upon its next iteration and subsequently turn itself off. */
            velocity.State.isTicking = false;

            /* Clear the calls array so that its length is reset. */
            delete velocity.State.calls;
            velocity.State.calls = [];
        }
    }