import React from 'react';
import { supabase } from '../services/supabaseClient';
import { startEtsyOAuth } from '../services/etsyService';

const SignIn: React.FC = () => {
    const handleGoogleLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
                    redirectTo: window.location.origin,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent'
                    }
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error logging in with Google:', error);
            alert('Failed to sign in with Google');
        }
    };

    const handleEtsyLogin = async () => {
        try {
            await startEtsyOAuth();
        } catch (error) {
            console.error('Error starting Etsy OAuth:', error);
            alert('Failed to start Etsy login');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Welcome to Alsoir</h1>
                <p className="mb-8 text-center text-gray-600">Sign in to manage your customer messages.</p>
                
                <div className="space-y-4">
                    <button
                        onClick={handleGoogleLogin}
                        className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 font-medium transition-colors"
                    >
                        Sign in with Google (Gmail)
                    </button>
                    
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Or</span>
                        </div>
                    </div>

                    <button
                        onClick={handleEtsyLogin}
                        className="w-full py-3 px-4 border border-gray-300 rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 font-medium transition-colors"
                    >
                        Sign in with Etsy
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignIn;
