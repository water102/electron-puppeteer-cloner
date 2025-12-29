/**
 * Lazy Load Processor
 * Enhanced lazy loading support - triggers all lazy-loaded content
 */

class LazyLoadProcessor {
  constructor() {
    this.lazyElements = [];
    this.triggeredCount = 0;
  }

  /**
   * Enhanced scroll and lazy load trigger
   * @param {Object} page - Puppeteer page instance
   * @param {Object} options - Options for lazy loading
   * @returns {Promise<void>}
   */
  async triggerLazyLoading(page, options = {}) {
    const {
      scrollDistance = 100,
      scrollDelay = 100,
      waitAfterScroll = 2000,
      maxScrolls = 50,
      triggerIntersectionObserver = true,
      triggerImageLoad = true
    } = options;

    console.log('Starting enhanced lazy loading trigger...');

    // Step 1: Find all lazy elements
    const lazyElements = await page.evaluate(() => {
      const elements = [];
      
      // Find images with loading="lazy"
      document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        elements.push({
          type: 'img-lazy',
          src: img.src,
          srcset: img.srcset,
          currentSrc: img.currentSrc
        });
      });

      // Find images with data-src (common lazy load pattern)
      document.querySelectorAll('img[data-src]').forEach(img => {
        elements.push({
          type: 'img-data-src',
          dataSrc: img.getAttribute('data-src'),
          src: img.src
        });
      });

      // Find iframes with loading="lazy"
      document.querySelectorAll('iframe[loading="lazy"]').forEach(iframe => {
        elements.push({
          type: 'iframe-lazy',
          src: iframe.src
        });
      });

      // Find elements with IntersectionObserver patterns
      document.querySelectorAll('[data-lazy], [data-src], [data-background]').forEach(el => {
        elements.push({
          type: 'custom-lazy',
          tagName: el.tagName,
          dataSrc: el.getAttribute('data-src'),
          dataLazy: el.getAttribute('data-lazy'),
          dataBackground: el.getAttribute('data-background')
        });
      });

      return elements;
    });

    console.log(`Found ${lazyElements.length} lazy elements`);

    // Step 2: Trigger IntersectionObserver manually
    if (triggerIntersectionObserver) {
      await page.evaluate(() => {
        // Simulate IntersectionObserver by triggering visibility
        const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src]');
        lazyImages.forEach(img => {
          // Trigger load by setting src if data-src exists
          if (img.dataset.src && !img.src) {
            img.src = img.dataset.src;
          }
          
          // Dispatch load event
          const event = new Event('load', { bubbles: true });
          img.dispatchEvent(event);
        });

        // Trigger intersection for all lazy elements
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const target = entry.target;
              if (target.dataset.src) {
                if (target.tagName === 'IMG') {
                  target.src = target.dataset.src;
                } else if (target.dataset.background) {
                  target.style.backgroundImage = `url(${target.dataset.background})`;
                }
              }
            }
          });
        }, { rootMargin: '50px' });

        document.querySelectorAll('[data-src], [data-lazy], [data-background]').forEach(el => {
          observer.observe(el);
        });

        // Force intersection for all observed elements
        setTimeout(() => {
          document.querySelectorAll('[data-src], [data-lazy], [data-background]').forEach(el => {
            const entry = {
              target: el,
              isIntersecting: true,
              intersectionRatio: 1
            };
            observer.observe(el);
            // Simulate intersection
            el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
          });
        }, 100);
      });
    }

    // Step 3: Enhanced scrolling with better coverage
    await page.evaluate(async (scrollDistance, scrollDelay, maxScrolls) => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        let scrollCount = 0;
        const distance = scrollDistance;
        
        const scrollInterval = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          const clientHeight = window.innerHeight;
          const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
          
          // Scroll down
          window.scrollBy(0, distance);
          totalHeight += distance;
          scrollCount++;

          // Also try scrolling to specific elements
          const lazyElements = document.querySelectorAll('img[loading="lazy"], img[data-src], [data-lazy]');
          lazyElements.forEach((el, index) => {
            if (index < 10) { // Limit to first 10 to avoid too many scrolls
              setTimeout(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, index * 50);
            }
          });

          // Check if we've reached the bottom or max scrolls
          if (scrollCount >= maxScrolls || 
              (currentScroll + clientHeight >= scrollHeight - 10)) {
            clearInterval(scrollInterval);
            
            // Final scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            
            // Wait a bit more for any final lazy loads
            setTimeout(() => {
              resolve();
            }, 500);
          }
        }, scrollDelay);
      });
    }, scrollDistance, scrollDelay, maxScrolls);

    // Step 4: Wait for lazy images to load
    if (triggerImageLoad) {
      await page.evaluate(() => {
        return new Promise((resolve) => {
          const images = document.querySelectorAll('img[loading="lazy"], img[data-src]');
          let loadedCount = 0;
          const totalImages = images.length;

          if (totalImages === 0) {
            resolve();
            return;
          }

          const checkComplete = () => {
            loadedCount++;
            if (loadedCount >= totalImages) {
              resolve();
            }
          };

          images.forEach(img => {
            if (img.complete) {
              checkComplete();
            } else {
              img.addEventListener('load', checkComplete, { once: true });
              img.addEventListener('error', checkComplete, { once: true });
              
              // Force load if data-src exists
              if (img.dataset.src && !img.src) {
                img.src = img.dataset.src;
              }
            }
          });

          // Timeout after 5 seconds
          setTimeout(() => {
            resolve();
          }, 5000);
        });
      });
    }

    // Step 5: Wait for additional content
    await new Promise(resolve => setTimeout(resolve, waitAfterScroll));

    // Step 6: Final check for any remaining lazy elements
    const remainingLazy = await page.evaluate(() => {
      const lazyImages = document.querySelectorAll('img[data-src]');
      lazyImages.forEach(img => {
        if (img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }
      });
      return lazyImages.length;
    });

    if (remainingLazy > 0) {
      console.log(`Triggered ${remainingLazy} remaining lazy images`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Enhanced lazy loading trigger completed');
  }

  /**
   * Get statistics about lazy elements
   * @param {Object} page - Puppeteer page instance
   * @returns {Promise<Object>} Statistics
   */
  async getLazyStats(page) {
    return await page.evaluate(() => {
      const stats = {
        lazyImages: document.querySelectorAll('img[loading="lazy"], img[data-src]').length,
        lazyIframes: document.querySelectorAll('iframe[loading="lazy"]').length,
        customLazy: document.querySelectorAll('[data-lazy], [data-src], [data-background]').length,
        total: 0
      };
      stats.total = stats.lazyImages + stats.lazyIframes + stats.customLazy;
      return stats;
    });
  }
}

export default LazyLoadProcessor;

