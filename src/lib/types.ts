export interface VideoClip {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  duration: number; // seconds
  createdAt: number; // timestamp
  tags: string[];
}
