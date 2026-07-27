// js/supabase-db.js
import { supabase } from './supabase-config.js';

/**
 * Creates a new testimony record in the database.
 * @param {string} userId - The user's ID
 * @param {string} content - The testimony text content
 * @param {string} mediaUrl - Optional media URL
 */
export async function createTestimony(userId, content, mediaUrl = null) {
  try {
    const { data, error } = await supabase
      .from('testimonies')
      .insert([
        {
          user_id: userId,
          content: content,
          media_url: mediaUrl
        }
      ]);

    if (error) {
      console.error('Error creating testimony:', error.message);
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Failed to execute createTestimony:', err);
    throw err;
  }
}

/**
 * Fetches testimonies from the database for the feed.
 */
export async function fetchTestimonies() {
  try {
    const { data, error } = await supabase
      .from('testimonies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching testimonies:', error.message);
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Failed to execute fetchTestimonies:', err);
    throw err;
  }
}
