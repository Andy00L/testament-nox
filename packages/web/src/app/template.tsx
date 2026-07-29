/**
 * Remounts the page slot on every navigation, so each screen's CSS entrance choreography
 * runs again when the visitor moves between the scene, the ritual and the door. The
 * layout above (curtain, roof, plaque) persists untouched.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return children;
}
