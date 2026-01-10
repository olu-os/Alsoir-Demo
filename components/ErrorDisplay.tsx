import React from 'react';

interface ErrorDisplayProps {
  error: any;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  if (!error) return null;

  // Attempt to parse Supabase function errors
  let errorMessage = 'An unknown error occurred.';
  if (typeof error.message === 'string') {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error) {
        errorMessage = `Function Error: ${parsed.error}`;
      } else {
        errorMessage = `Error: ${error.message}`;
      }
    } catch (e) {
      errorMessage = error.message;
    }
  } else if (error.toString) {
    errorMessage = error.toString();
  }

  return (
    <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md z-50">
      <strong className="font-bold">Sync Failed!</strong>
      <span className="block sm:inline ml-2">{errorMessage}</span>
    </div>
  );
};

export default ErrorDisplay;
