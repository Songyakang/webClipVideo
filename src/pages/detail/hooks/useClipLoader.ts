import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { VideoClip } from "../../../lib/types";
import { getClipById } from "../../../lib/store";

export function useClipLoader(id: string | undefined) {
  const navigate = useNavigate();
  const [clip, setClip] = useState<VideoClip | null>(null);

  useEffect(() => {
    if (!id) return;
    getClipById(id).then((found) => {
      if (!found) { navigate("/", { replace: true }); return; }
      setClip(found);
    });
  }, [id, navigate]);

  return { clip, setClip };
}
