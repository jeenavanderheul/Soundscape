/**
 * §197 the way into the menu on a phone (user: "een menu bar rechts boven waar
 * overlay komt met de menu opties net zoals de desktop versie").
 *
 * This is a DOOR, not a menu. It opens the pause overlay that Escape has
 * always opened — the same object, through the same method on the Game — so
 * the two entrances cannot drift into two different menus (§56: never two
 * answers to one question). Nothing here duplicates a menu option.
 *
 * It lives OUTSIDE the #app container on purpose: that is where TouchControls
 * listens, and the right half of the screen is the wind. A touch on this
 * button therefore never reaches the wind at all.
 */

export interface MenuButtonState {
  /** Touch hardware — a desk already has Escape, and its picture is approved. */
  touch: boolean;
  /** Before the audio is unlocked there is nothing to pause. */
  unlocked: boolean;
  /** While the overlay is open, the overlay IS the menu. */
  paused: boolean;
}

/** Pure: whether the door should be on screen right now. */
export function menuButtonVisible(state: MenuButtonState): boolean {
  return state.touch && state.unlocked && !state.paused;
}

export class MenuButton {
  private readonly root: HTMLButtonElement;

  constructor(onOpen: () => void, parent: HTMLElement = document.body) {
    this.root = document.createElement('button');
    this.root.id = 'menu-button';
    this.root.type = 'button';
    this.root.textContent = 'Menu';
    this.root.setAttribute('aria-label', 'Menu');
    // The flag TouchControls looks for: a touch that lands here is interface,
    // not a control input. Belt and braces next to living outside #app.
    this.root.dataset.uiControl = '';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      // The container's click handler re-acquires pointer lock; the menu is
      // the one place that must not happen.
      event.stopPropagation();
      onOpen();
    });
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    // A hidden button must not keep the focus ring, or Enter would reopen it.
    if (!visible && document.activeElement === this.root) this.root.blur();
  }

  dispose(): void {
    this.root.remove();
  }
}
