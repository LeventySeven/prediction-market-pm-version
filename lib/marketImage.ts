/**
 * Helper functions for market images stored in Supabase storage
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

/**
 * Get the public URL for a market image stored in Supabase storage
 * @param path The path to the image in the market-images bucket (e.g., "image-123.jpg")
 * @returns The full public URL to the image
 */
export function getMarketImageUrl(path: string): string {
  if (!path) return '';
  // If it's already a full URL, return it as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // Otherwise, construct the Supabase storage URL
  if (!SUPABASE_URL) {
    console.warn('NEXT_PUBLIC_SUPABASE_URL is not set');
    return path;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/market-images/${path}`;
}

/**
 * Upload a market image to Supabase storage
 * This should be called from the client side with an authenticated Supabase client
 * @param file The image file to upload
 * @param supabaseClient The Supabase client instance (from @supabase/supabase-js)
 * @returns The path to the uploaded image in the bucket
 */
export async function uploadMarketImage(
  file: File,
  supabaseClient: { storage: { from: (bucket: string) => { upload: (path: string, file: File) => Promise<{ data: { path: string } | null; error: unknown }> } } }
): Promise<string | null> {
  try {
    // Generate a unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `market-${timestamp}-${randomStr}.${extension}`;

    // Upload to Supabase storage
    const { data, error } = await supabaseClient.storage
      .from('market-images')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading image:', error);
      return null;
    }

    return data?.path || null;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
}
