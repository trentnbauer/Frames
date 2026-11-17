import { useLayoutEffect, useRef } from 'react';

/**
 * The pill behind the chosen option of a segmented control (Shoots | Photos and the like), sliding to the new choice.
 * Put it first inside the control; it finds the chosen option (aria-selected, aria-pressed or .on) itself.
 */
export function SegSlider() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const pill = ref.current, box = pill?.parentElement;
    if (!pill || !box) return;
    box.classList.add('has-seg-slider');
    const place = () => {
      const on = box.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-pressed="true"], :scope > [aria-checked="true"], :scope > .on');
      if (!on) { pill.style.opacity = '0'; return; }
      Object.assign(pill.style, { opacity: '1', width: `${on.offsetWidth}px`, height: `${on.offsetHeight}px`, transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
    };
    place();
    // The first placement does not slide in from the corner; later changes do.
    const t = requestAnimationFrame(() => pill.classList.add('ready'));
    const ro = new ResizeObserver(place);
    ro.observe(box);
    const mo = new MutationObserver(place);
    mo.observe(box, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-pressed', 'class'] });
    return () => { cancelAnimationFrame(t); ro.disconnect(); mo.disconnect(); };
  }, []);
  return <span ref={ref} className="seg-slider" aria-hidden />;
}
