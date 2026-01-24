import React from 'react';
import { supabase } from '../services/supabaseClient';
import { startEtsyOAuth } from '../services/etsyService';

const SignIn: React.FC = () => {
    const handleGoogleLogin = async () => {
        try {
            const scopes = 'openid email profile https://www.googleapis.com/auth/gmail.readonly';
            const redirectTo = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    scopes,
                    redirectTo,
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

    // const handleEtsyLogin = async () => {
    //     try {
    //         await startEtsyOAuth();
    //     } catch (error) {
    //         console.error('Error starting Etsy OAuth:', error);
    //         alert('Failed to start Etsy login');
    //     }
    // };

    // Demo login handler
    const handleDemoLogin = async () => {
        // Demo credentials (should match a test user in your Supabase project)
        const demoEmail = 'demo@alsoir.com';
        const demoPassword = 'demopassword';
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: demoEmail,
                password: demoPassword,
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error logging in as demo user:', error);
            alert('Failed to sign in as demo user.');
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
                    <button
                        onClick={handleDemoLogin}
                        className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 font-medium transition-colors"
                    >
                        Demo Mode
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignIn;
