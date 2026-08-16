"""Structural image preprocessors for ControlNet conditioning maps.

This module intentionally lazy-loads the Depth Anything v2 pipeline so importing it
is cheap and the model is only resident when depth extraction is requested.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import pipeline


@dataclass
class StructuralPreprocessor:
    """Extract Canny line art and Depth Anything v2 maps for conditioning."""

    depth_model: str = "depth-anything/Depth-Anything-V2-Small-hf"
    _depth_pipe: Any | None = field(default=None, init=False, repr=False)
    _device: int = field(default=-1, init=False, repr=False)

    @staticmethod
    def _to_pil_rgb(image: Image.Image | np.ndarray) -> Image.Image:
        if isinstance(image, Image.Image):
            return image.convert("RGB")
        if isinstance(image, np.ndarray):
            if image.ndim == 2:
                return Image.fromarray(image.astype(np.uint8), mode="L").convert("RGB")
            if image.ndim == 3:
                arr = image.astype(np.uint8)
                if arr.shape[2] == 4:
                    arr = cv2.cvtColor(arr, cv2.COLOR_BGRA2RGBA)
                    return Image.fromarray(arr, mode="RGBA").convert("RGB")
                # OpenCV arrays are usually BGR; convert to RGB for PIL.
                arr = cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
                return Image.fromarray(arr, mode="RGB")
        raise TypeError("image must be a PIL.Image.Image or numpy.ndarray")

    def extract_canny(
        self,
        image: Image.Image | np.ndarray,
        low_threshold: int = 100,
        high_threshold: int = 200,
    ) -> Image.Image:
        """Return a single-channel Canny edge map as a PIL image."""
        pil_image = self._to_pil_rgb(image)
        rgb = np.asarray(pil_image)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 1.2)
        edges = cv2.Canny(blurred, low_threshold, high_threshold)
        return Image.fromarray(edges, mode="L")

    def _load_depth_pipeline(self) -> Any:
        if self._depth_pipe is None:
            cuda_available = torch.cuda.is_available()
            self._device = 0 if cuda_available else -1
            torch_dtype = torch.float16 if cuda_available else torch.float32
            self._depth_pipe = pipeline(
                task="depth-estimation",
                model=self.depth_model,
                device=self._device,
                torch_dtype=torch_dtype,
            )
        return self._depth_pipe

    def extract_depth(self, image: Image.Image | np.ndarray) -> Image.Image:
        """Return a normalized Depth Anything v2 depth map as an 8-bit PIL image."""
        pil_image = self._to_pil_rgb(image)
        result = self._load_depth_pipeline()(pil_image)
        depth = result.get("depth") if isinstance(result, dict) else result
        if isinstance(depth, Image.Image):
            depth_arr = np.asarray(depth.convert("L"), dtype=np.float32)
        else:
            depth_arr = np.asarray(depth, dtype=np.float32)
            if depth_arr.ndim == 3:
                depth_arr = depth_arr.squeeze()
        min_val = float(np.nanmin(depth_arr))
        max_val = float(np.nanmax(depth_arr))
        if max_val > min_val:
            depth_arr = (depth_arr - min_val) / (max_val - min_val) * 255.0
        else:
            depth_arr = np.zeros_like(depth_arr)
        return Image.fromarray(depth_arr.clip(0, 255).astype(np.uint8), mode="L")
