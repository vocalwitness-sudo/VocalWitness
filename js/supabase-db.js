// js/supabase-db.js
import { supabase } from './supabase-config.js';

// Fetch all testimonies for your feed
export async function fetchTestimonies() {
    const { data, error } = await supabase
        .from('testimonies')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching testimonies:', error.message);
        return [];
    }
    return data;
}

// Add a new testimony from your composer
export async function createTestimony(userId, contentText, mediaUrl = null) {
    const { data, error } = await supabase
        .from('testimonies')
        .insert([
            { user_id: userId, content: contentText, media_url: mediaUrl }
        ]);

    if (error) {
        console.error('Error creating testimony:', error.message);
        return null;
    }
    return data;
}
