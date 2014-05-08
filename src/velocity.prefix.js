/****************
     Summary
****************/

/*
Velocity recreates the entirety of jQuery's CSS stack and builds a concise animation layer on top of it. To minimize DOM interaction, Velocity reuses previous animation values and batches DOM queries.
Whenever Velocity triggers a DOM query (a GET) or a DOM update (a SET), a comment indicating as much is placed next to the offending line of code.
Watch these talks to learn about the nuances of DOM performance: https://www.youtube.com/watch?v=cmZqLzPy0XE and https://www.youtube.com/watch?v=n8ep4leoN9A

Velocity is structured into four sections:
- CSS Stack: Works independently from the rest of Velocity.
- $.fn.velocity is the jQuery object extension that, when triggered, iterates over the targeted element set and queues the incoming Velocity animation onto each element individually. This process consists of:
  - Pre-Queueing: Prepare the element for animation by instantiating its data cache and processing the call's options argument.
  - Queueing: The logic that runs once the call has reached its point of execution in the element's $.queue() stack. Most logic is placed here to avoid risking it becoming stale.
  - Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
- Tick: The single requestAnimationFrame loop responsible for tweening all in-progress calls.
- completeCall: Handles the cleanup process for each Velocity call.

To interoperate with jQuery, Velocity uses jQuery's own $.queue() stack for all queuing logic. This has the byproduct of slightly bloating our codebase since $.queue()'s behavior is not straightforward.
The biggest cause of both codebase bloat and codepath obfuscation in Velocity is its support for animating compound-value CSS properties (e.g. "textShadow: 0px 0px 0px black" and "transform: skew(45) scale(1.5)").
*/

;(function (global, document, undefined) {