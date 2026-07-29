/**
 * The curtain's physical constants.
 *
 * These are not motion tokens: the curtain is a simulation, not a keyframe, so it has no
 * duration or easing. It has weight, damping and wind. Everything here is tuned by eye
 * against the reference (Liam Egan's "Strings" pen, MIT) and documented with its unit so
 * the next person can retune it without guessing.
 */

/** Strands hanging from the eave. Capped on small screens so mobile holds 60fps. */
export const STRAND_COUNT_DESKTOP = 40;
export const STRAND_COUNT_MOBILE = 24;

/** Viewport width at or below which the mobile strand count applies. Unit: CSS px. */
export const MOBILE_BREAKPOINT_PX = 768;

/** Points per strand, including the pinned one at the eave. */
export const SEGMENTS_PER_STRAND = 14;

/** Fraction of the viewport height a strand spans at rest. */
export const STRAND_LENGTH_RATIO = 0.58;

/**
 * How much strand length varies from one strand to the next, as a fraction of the base.
 * Without it every cord ends on the same line and the curtain grows a flat shelf across
 * the viewport; a hung curtain has an uneven hem.
 */
export const STRAND_LENGTH_VARIANCE = 0.16;

/** Fixed simulation step, so the curtain behaves identically at any frame rate. Unit: seconds. */
export const FIXED_TIMESTEP_SECONDS = 1 / 60;

/** Upper bound on catch-up steps per frame, so a backgrounded tab cannot spiral. */
export const MAX_STEPS_PER_FRAME = 5;

/** Downward acceleration. Unit: CSS px per second squared. */
export const GRAVITY_PX_PER_S2 = 980;

/** Velocity retained each step. Below 1 so the curtain settles instead of ringing forever. */
export const VELOCITY_DAMPING = 0.985;

/** Relaxation passes per step. More passes means stiffer, less stretchy strands. */
export const CONSTRAINT_ITERATIONS = 4;

/** Radius inside which the pointer pushes strands aside. Unit: CSS px. */
export const POINTER_RADIUS_PX = 190;

/** Peak acceleration the pointer imparts at its centre. Unit: CSS px per second squared. */
export const POINTER_STRENGTH_PX_PER_S2 = 5200;

/**
 * Ambient breeze amplitude when the testament is healthy. Unit: CSS px per second squared.
 * Low on purpose: a curtain hangs and sways, it does not stream sideways. Anything much
 * above this and the strands read as diagonal rain rather than as cords under their own
 * weight.
 */
export const BREEZE_STRENGTH_PX_PER_S2 = 52;

/** Full cycles of the ambient breeze per second. Slow enough to read as air, not vibration. */
export const BREEZE_FREQUENCY_HZ = 0.085;

/** How much the breeze phase shifts across the curtain, so it travels rather than pulsing. */
export const BREEZE_PHASE_PER_STRAND = 0.42;

/** Peak acceleration of a heartbeat gust. Unit: CSS px per second squared. */
export const GUST_STRENGTH_PX_PER_S2 = 4200;

/**
 * Steady wind held while the heartbeat control is pressed, at full charge.
 * The curtain leaning is the charge meter. Unit: CSS px per second squared.
 */
export const CHARGE_STRENGTH_PX_PER_S2 = 1500;

/** How long a heartbeat gust takes to sweep the full width. Unit: seconds. */
export const GUST_SWEEP_SECONDS = 1.15;

/** Width of the gust's leading edge as a fraction of the viewport. */
export const GUST_WIDTH_RATIO = 0.26;

/** Beads sit at these fractions along a strand, measured from the eave. */
export const BEAD_POSITIONS = [0.34, 0.58, 0.79] as const;

/**
 * Per-strand shift applied to every bead, so beads never line up into horizontal rows.
 * Without it three tidy dotted rules appear across the viewport and the curtain reads as
 * graph paper instead of as strung beads. Unit: fraction of strand length.
 */
export const BEAD_STAGGER_RANGE = 0.07;

/** Bead radius. Unit: CSS px. */
export const BEAD_RADIUS_PX = 3.4;

/**
 * Opacity the whole curtain is drawn at.
 * The curtain is the signature, not the loudest thing on screen: at full strength the
 * strands compete with the headline for the eye, and two things fighting reads cheap.
 */
export const STRAND_ALPHA = 0.5;

/** Strand stroke width at the eave and at the free end. Unit: CSS px. */
export const STRAND_WIDTH_TOP_PX = 1.5;
export const STRAND_WIDTH_BOTTOM_PX = 0.7;

/** Downward kick given to a strand the moment the curtain is released. Unit: CSS px per second. */
export const RELEASE_FALL_SPEED_PX_PER_S = 260;

/** Seconds between each strand detaching once released, so the curtain falls as a wave. */
export const RELEASE_STAGGER_SECONDS = 0.055;

/** Reach of the ripple sent when a bequest joins the will. Unit: CSS px. */
export const RIPPLE_RADIUS_PX = 340;

/** Peak displacement at the ripple's centre. Unit: CSS px. */
export const RIPPLE_STRENGTH_PX = 26;
