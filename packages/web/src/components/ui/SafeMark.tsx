/**
 * Safe's own mark, so the vault field names the thing it actually points at.
 *
 * The three shapes are Safe's, taken verbatim from the brand asset served at
 * safe.global/images/common/safe-logo-wallet.svg, cropped to the mark and stripped of the
 * wordmark beside it and of the baked drop shadow behind it. Nothing is redrawn: an invented
 * logo would be worse than none, and this one has to be recognisable to be worth showing.
 *
 * It renders in `currentColor` rather than Safe's near-black, so it sits in this product's
 * warm ink instead of introducing a second black. The asset itself ships in a dark and a
 * white variant, so a single flat colour is how the mark is meant to be used.
 *
 * No tile, no chip, no rounded square behind it: a mark parked on a container reads as a
 * component-kit default, and this one needs no help separating from cream paper.
 */

/** The mark's own bounds inside the source artboard, in its units. */
const MARK_VIEW_BOX = "1 4.43 15.62 15.15";

export function SafeMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEW_BOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M15.7043 11.9959H14.0103C13.5044 11.9959 13.0944 12.3931 13.0944 12.8833V15.2656C13.0944 15.7559 12.6845 16.1531 12.1786 16.1531H5.43932C4.93339 16.1531 4.52344 16.5503 4.52344 17.0405V18.6819C4.52344 19.1721 4.93339 19.5693 5.43932 19.5693H12.5686C13.0746 19.5693 13.4787 19.1721 13.4787 18.6819V17.365C13.4787 16.8748 13.8886 16.5271 14.3946 16.5271H15.704C16.2099 16.5271 16.6198 16.1298 16.6198 15.6396V12.873C16.6198 12.3828 16.2099 11.9959 15.704 11.9959H15.7043Z" />
      <path d="M4.52575 8.7343C4.52575 8.24409 4.9357 7.84687 5.44163 7.84687H12.1767C12.6827 7.84687 13.0926 7.44965 13.0926 6.95943V5.31808C13.0926 4.82787 12.6827 4.43065 12.1767 4.43065H5.05122C4.54528 4.43065 4.13533 4.82787 4.13533 5.31808V6.58281C4.13533 7.07302 3.72538 7.47024 3.21944 7.47024H1.91589C1.40995 7.47024 1 7.86746 1 8.35767V11.1273C1 11.6175 1.41167 11.9948 1.9176 11.9948H3.61158C4.11751 11.9948 4.52746 11.5975 4.52746 11.1073L4.52575 8.73463V8.7343Z" />
      <path d="M8.01513 10.2701H9.64227C10.1725 10.2701 10.6027 10.6872 10.6027 11.2007V12.7773C10.6027 13.2911 10.1722 13.7079 9.64227 13.7079H8.01513C7.48487 13.7079 7.05469 13.2907 7.05469 12.7773V11.2007C7.05469 10.6869 7.48521 10.2701 8.01513 10.2701Z" />
    </svg>
  );
}
