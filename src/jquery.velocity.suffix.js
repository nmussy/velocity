	$.velocity = velocity;
    $.easing = velocity.Easings;
	$.fn.velocity = velocity.animate;
})(jQuery, window, document);

/***************
    Defaults
***************/

/* Page-wide option defaults, which can be overridden by the user. */
$.fn.velocity.defaults = {
    queue: "",
    duration: 400,
    easing: "swing",
    complete: null,
    display: null,
    loop: false,
    delay: false,
    mobileHA: true,
    /* Set to false to prevent property values from being cached between immediately consecutive Velocity-initiated calls. See Value Transferring for further details. */
    _cacheValues: true
};