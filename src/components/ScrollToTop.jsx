import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pulse } from '../utils/pulse.js';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  // Where they went, for the hourly digest. This component already sits on
  // every route change, so the monitor gets its page trail without a second
  // listener. Digest only: a page view never interrupts anybody.
  useEffect(() => {
    pulse('page_view');
  }, [pathname]);

  useEffect(() => {
    const handlePageShow = (e) => {
      if (e.persisted) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return null;
}
