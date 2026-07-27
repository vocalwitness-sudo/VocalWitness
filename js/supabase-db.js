// js/supabase-db.js
import { supabase } from './supabase-config.js';

/**
 * Creates a new testimony record in the database.
 * @param {Object} testimonyData - Object containing user_id, content, media_url
 */
export async function createTestimony(testimonyData) {
  try {
    const { data, error } = await supabase
      .from('testimonies')
      .insert([
        {
          user_id: testimonyData.user_id,
          content: testimonyData.content,
          media_url: testimonyData.media_url || null
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
