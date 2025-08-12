// src/utils/widgetUtils.ts

interface BookParams {
  customId: string;
  name: string;
}

interface WidgetInitializationCallbacks {
  onSuccess: (bookName: string) => void;
  onError: () => void;
  onStart: () => void;
}

/**
 * Handles widget initialization with token verification
 * Only sets success status after successful token retrieval
 */
export const initializeWidget = (
  getBookParams: () => BookParams,
  callbacks: WidgetInitializationCallbacks,
  isInitializing: boolean
): void => {
  if (isInitializing) return; // Prevent multiple calls
  
  callbacks.onStart();
  
  if (!(window as any).ocrolus_script) {
    console.warn('ocrolus_script not found');
    callbacks.onError();
    return;
  }

  try {
    // Store the original getAuthToken function if it exists
    const originalGetAuthToken = (window as any).getAuthToken;
    
    // Override getAuthToken to track successful token retrieval
    (window as any).getAuthToken = async () => {
      try {
        const { customId, name } = getBookParams();
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            custom_id: customId,
            bookName: name,
          }),
        });
        
        if (!res.ok) {
          throw new Error(`Token request failed: ${res.status}`);
        }
        
        const json = await res.json();
        
        if (json.accessToken) {
          // Token successfully retrieved - trigger success callback
          console.log('Token successfully retrieved for widget');
          callbacks.onSuccess(name);
        } else {
          throw new Error('No access token in response');
        }
        
        return json.accessToken;
      } catch (error) {
        console.error('Token retrieval failed:', error);
        callbacks.onError();
        throw error;
      }
    };
    
    // Initialize the widget
    (window as any).ocrolus_script('init');
    console.log('Widget initialization started');
    
    // Set a timeout fallback in case token retrieval never happens
    setTimeout(() => {
      console.warn('Widget initialization timeout - no token retrieved');
      callbacks.onError();
    }, 10000); // 10 second timeout
    
  } catch (error) {
    console.error('Widget initialization failed:', error);
    callbacks.onError();
  }
};

/**
 * Sets up the global getAuthToken function for the widget
 * This should be called in useEffect to ensure it's always available
 */
export const setupGlobalAuthToken = (getBookParams: () => BookParams): void => {
  (window as any).getAuthToken = async () => {
    const { customId, name } = getBookParams();
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom_id: customId,
        bookName: name,
      }),
    });
    const json = await res.json();
    return json.accessToken;
  };
};