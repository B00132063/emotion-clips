# Import FastAPI so we can create our backend API
from fastapi import FastAPI

# Import StaticFiles so the frontend can see the generated video clips
from fastapi.staticfiles import StaticFiles

# Import CORS so the frontend can talk to the backend
from fastapi.middleware.cors import CORSMiddleware

# Import BaseModel so we can define what data the user sends
from pydantic import BaseModel

# Import DeepFace to detect emotions from images
from deepface import DeepFace

# Import VideoFileClip so we can cut and edit video clips
from moviepy import VideoFileClip

# Import Whisper so we can generate captions from speech
import whisper

# Import re so we can check if the link looks like a YouTube link
import re

# Used to create a small local database
import sqlite3

# Used to safely hash passwords
import hashlib

# Import os so we can create folders and file paths
import os

# Import yt_dlp so we can get YouTube video info and download videos
import yt_dlp

# Import cv2 so we can extract frames from videos
import cv2


# Create the FastAPI app
app = FastAPI()


# Allow the frontend to connect to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Folder where downloaded videos will be saved
DOWNLOAD_FOLDER = "downloads"

# Folder where extracted frames will be saved
FRAMES_FOLDER = "frames"

# Folder where generated clips will be saved
CLIPS_FOLDER = "clips"


# Create folders if they do not exist
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
os.makedirs(FRAMES_FOLDER, exist_ok=True)
os.makedirs(CLIPS_FOLDER, exist_ok=True)


# Make clips available in the browser
# Example: http://127.0.0.1:8000/clips/video_id/clip.mp4
app.mount("/clips", StaticFiles(directory=CLIPS_FOLDER), name="clips")


# Load Whisper model once
# "base" is more accurate, "tiny" is faster
whisper_model = whisper.load_model("base")


# This class defines the data we expect from the user
# The user must send a YouTube URL
class YouTubeRequest(BaseModel):
    youtube_url: str

# This class defines register/login data
class UserRequest(BaseModel):
    name: str | None = None
    email: str
    password: str


# This creates the users database table
def create_users_table():
    connection = sqlite3.connect("users.db")
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT
        )
    """)

    connection.commit()
    connection.close()


# This turns a password into a safer hashed version
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


# Create users table when backend starts
create_users_table()


# Register a new user
@app.post("/register")
def register_user(request: UserRequest):
    try:
        connection = sqlite3.connect("users.db")
        cursor = connection.cursor()

        hashed_password = hash_password(request.password)

        cursor.execute(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            (request.name, request.email, hashed_password)
        )

        connection.commit()
        connection.close()

        return {
            "message": "Account created successfully",
            "email": request.email
        }

    except sqlite3.IntegrityError:
        return {
            "error": "An account with this email already exists."
        }


# Login existing user
@app.post("/login")
def login_user(request: UserRequest):
    connection = sqlite3.connect("users.db")
    cursor = connection.cursor()

    hashed_password = hash_password(request.password)

    cursor.execute(
        "SELECT id, name, email FROM users WHERE email = ? AND password = ?",
        (request.email, hashed_password)
    )

    user = cursor.fetchone()
    connection.close()

    if user is None:
        return {
            "error": "Invalid email or password."
        }

    return {
        "message": "Login successful",
        "user": {
            "id": user[0],
            "name": user[1],
            "email": user[2]
        }
    }


# This function extracts image frames from the downloaded video
def extract_frames(video_path, video_id):
    # Create a folder for this video's frames
    video_frames_folder = os.path.join(FRAMES_FOLDER, video_id)
    os.makedirs(video_frames_folder, exist_ok=True)

    # Open the video file
    video = cv2.VideoCapture(video_path)

    # Get the video's frames per second
    fps = video.get(cv2.CAP_PROP_FPS)

    # If fps cannot be read, use 30 as default
    if fps == 0:
        fps = 30

    # Save 1 frame every second
    frame_interval = int(fps)

    # Count every frame in the video
    frame_count = 0

    # Count how many frames we save
    saved_count = 0

    while True:
        # Read the next frame
        success, frame = video.read()

        # Stop if there are no more frames
        if not success:
            break

        # Save one frame every second
        if frame_count % frame_interval == 0:
            frame_filename = f"frame_{saved_count}.jpg"
            frame_path = os.path.join(video_frames_folder, frame_filename)

            # Save the frame as an image
            cv2.imwrite(frame_path, frame)

            saved_count += 1

        frame_count += 1

    # Close the video
    video.release()

    return {
        "frames_folder": video_frames_folder,
        "frames_saved": saved_count
    }


# This gets the number from a frame name
# Example: frame_105.jpg becomes 105
def get_frame_number(file_name):
    return int(file_name.replace("frame_", "").replace(".jpg", ""))


# This function checks the saved frames and detects emotions
def detect_emotions(frames_folder):
    emotion_results = []

    # Sort frames correctly: frame_1, frame_2, frame_3, etc.
    frame_files = sorted(
        [file for file in os.listdir(frames_folder) if file.endswith(".jpg")],
        key=get_frame_number
    )

    for file_name in frame_files:
        image_path = os.path.join(frames_folder, file_name)

        try:
            # Use DeepFace to detect emotions in the image
            analysis = DeepFace.analyze(
                img_path=image_path,
                actions=["emotion"],
                enforce_detection=False
            )

            # Get the strongest emotion
            main_emotion = analysis[0]["dominant_emotion"]

            # Get the second from the frame name
            frame_number = get_frame_number(file_name)

            emotion_results.append({
                "frame": file_name,
                "second": frame_number,
                "emotion": main_emotion
            })

        except Exception:
            # If one frame fails, skip it
            continue

    return emotion_results


# This function groups emotions into better segments
def group_emotions_into_better_segments(emotion_results):
    useful_emotions = ["happy", "sad", "angry", "surprise", "fear"]
    segments = []

    current_emotion = None
    start_time = None
    end_time = None

    for result in emotion_results:
        emotion = result["emotion"]
        second = result["second"]

        # Ignore neutral because it is usually less interesting
        if emotion not in useful_emotions:
            if current_emotion is not None:
                segments.append({
                    "emotion": current_emotion,
                    "start_time": start_time,
                    "end_time": end_time
                })

            current_emotion = None
            start_time = None
            end_time = None
            continue

        # Start a new emotion segment
        if current_emotion is None:
            current_emotion = emotion
            start_time = second
            end_time = second + 1

        # Continue the same emotion segment
        elif emotion == current_emotion:
            end_time = second + 1

        # Emotion changed, save old segment and start new one
        else:
            segments.append({
                "emotion": current_emotion,
                "start_time": start_time,
                "end_time": end_time
            })

            current_emotion = emotion
            start_time = second
            end_time = second + 1

    # Save the final segment
    if current_emotion is not None:
        segments.append({
            "emotion": current_emotion,
            "start_time": start_time,
            "end_time": end_time
        })

    # Add duration to each segment
    for segment in segments:
        segment["duration"] = segment["end_time"] - segment["start_time"]

    # Sort longest emotion segments first
    segments = sorted(segments, key=lambda x: x["duration"], reverse=True)

    return segments


# This function chooses the best moments for clips
def choose_clip_moments(emotion_segments, video_duration):
    clip_moments = []

    for segment in emotion_segments:
        emotion = segment["emotion"]
        start_time = segment["start_time"]
        end_time = segment["end_time"]

        # Create a clip around this emotional moment
        clip_start = max(0, start_time - 3)
        clip_end = min(video_duration, end_time + 7)

        # Avoid very tiny clips
        if clip_end - clip_start < 5:
            continue

        clip_moments.append({
            "emotion": emotion,
            "start_time": clip_start,
            "end_time": clip_end
        })

        # Only make 3 clips for now
        if len(clip_moments) == 3:
            break

    return clip_moments


# This function makes clips vertical for TikTok, Shorts, and Reels
def make_clip_vertical(clip):
    target_width = 1080
    target_height = 1920
    target_ratio = target_width / target_height
    clip_ratio = clip.w / clip.h

    # If the video is too wide, resize by height and crop the sides
    if clip_ratio > target_ratio:
        resized_clip = clip.resized(height=target_height)

        vertical_clip = resized_clip.cropped(
            x_center=resized_clip.w / 2,
            width=target_width,
            height=target_height
        )

    # If the video is too tall or narrow, resize by width and crop top/bottom
    else:
        resized_clip = clip.resized(width=target_width)

        vertical_clip = resized_clip.cropped(
            y_center=resized_clip.h / 2,
            width=target_width,
            height=target_height
        )

    return vertical_clip


# This function creates captions using Whisper
def create_captions(clip_path):
    try:
        # Whisper listens to the clip and turns speech into text
        result = whisper_model.transcribe(clip_path)

        captions = []

        # Save captions with start and end times
        for segment in result["segments"]:
            captions.append({
                "start": round(segment["start"], 2),
                "end": round(segment["end"], 2),
                "text": segment["text"].strip()
            })

        return {
            "full_text": result["text"].strip(),
            "captions": captions
        }

    except Exception as e:
        # If captions fail, return a backup message instead of crashing
        return {
            "full_text": "Caption could not be generated for this clip.",
            "captions": [],
            "caption_error": str(e)
        }

# This function creates vertical clips
# It is safer because if one clip fails, the whole app will not crash
def create_video_clips(video_path, video_id, clip_moments, video_duration):
    created_clips = []

    # Create folder for this video's clips
    video_clips_folder = os.path.join(CLIPS_FOLDER, video_id)
    os.makedirs(video_clips_folder, exist_ok=True)

    # Open the full video
    video = VideoFileClip(video_path)

    for index, moment in enumerate(clip_moments):
        try:
            emotion = moment["emotion"]
            start_time = moment["start_time"]
            end_time = moment["end_time"]

            # Make sure the clip does not go past the video length
            if end_time > video_duration:
                end_time = video_duration

            # Create clip file name
            clip_filename = f"{emotion}_vertical_clip_{index + 1}.mp4"
            clip_path = os.path.join(video_clips_folder, clip_filename)

            # Cut clip from full video
            clip = video.subclipped(start_time, end_time)

            # Make clip vertical
            vertical_clip = make_clip_vertical(clip)

            # Save the clip
            # logger=None stops MoviePy terminal logger problems
            vertical_clip.write_videofile(
                clip_path,
                codec="libx264",
                audio_codec="aac",
                logger=None
            )

            # Close clips
            vertical_clip.close()
            clip.close()

            # TEMPORARY safe caption
            # We will fix Whisper after clips work again
            caption_result = {
                "full_text": "Caption will be generated here.",
                "captions": []
            }

            # URL frontend can use
            clip_url = f"http://127.0.0.1:8000/clips/{video_id}/{clip_filename}"

            created_clips.append({
                "emotion": emotion,
                "start_time": start_time,
                "end_time": end_time,
                "clip_path": clip_path,
                "clip_url": clip_url,
                "caption_text": caption_result["full_text"],
                "captions": caption_result["captions"]
            })

        except Exception as e:
            # If one clip fails, skip it and continue
            print("Clip failed:", str(e))
            continue

    # Close full video
    video.close()

    return created_clips


# This route checks if the backend is working
@app.get("/")
def home():
    return {"message": "Emotion Clips backend is working"}

# This route checks the YouTube video before the user signs up
@app.post("/check-video")
def check_video(request: YouTubeRequest):
    # Store YouTube URL
    url = request.youtube_url

    # Check if it looks like a YouTube link
    youtube_pattern = r"(https?://)?(www\.)?(youtube\.com|youtu\.be)/"

    if not re.match(youtube_pattern, url):
        return {
            "error": "Invalid YouTube link. Please enter a YouTube URL."
        }

    try:
        # Get video info without downloading it
        info_options = {
            "quiet": True,
            "skip_download": True
        }

        with yt_dlp.YoutubeDL(info_options) as ydl:
            video_info = ydl.extract_info(url, download=False)

        # Get title and duration
        video_title = video_info.get("title", "Unknown title")
        duration_seconds = video_info.get("duration", 0)
        duration_minutes = round(duration_seconds / 60, 2)

        # Reject videos over 5 minutes
        if duration_seconds > 300:
            return {
                "error": f"This video is too big: {duration_minutes} minutes. Please use a video that is 5 minutes or less.",
                "title": video_title,
                "duration_seconds": duration_seconds,
                "duration_minutes": duration_minutes
            }

        # If video is 5 minutes or less, accept it
        return {
            "message": "Video is accepted.",
            "title": video_title,
            "duration_seconds": duration_seconds,
            "duration_minutes": duration_minutes
        }

    except Exception as e:
        return {
            "error": "Could not check this YouTube video.",
            "details": str(e)
        }

# This route receives the YouTube link from the user
@app.post("/analyse")
def analyse_video(request: YouTubeRequest):
    # Store YouTube URL
    url = request.youtube_url

    # Check if it looks like a YouTube link
    youtube_pattern = r"(https?://)?(www\.)?(youtube\.com|youtu\.be)/"

    if not re.match(youtube_pattern, url):
        return {
            "error": "Invalid YouTube link. Please enter a YouTube URL."
        }

    try:
        # Get video info first without downloading
        info_options = {
            "quiet": True,
            "skip_download": True
        }

        with yt_dlp.YoutubeDL(info_options) as ydl:
            video_info = ydl.extract_info(url, download=False)

        # Get video title and duration
        video_title = video_info.get("title", "Unknown title")
        duration_seconds = video_info.get("duration", 0)
        duration_minutes = round(duration_seconds / 60, 2)

        # Reject videos over 5 minutes
        if duration_seconds > 300:
            return {
                "error": "Video is too long. Please use a video that is 5 minutes or less.",
                "title": video_title,
                "duration_seconds": duration_seconds,
                "duration_minutes": duration_minutes
            }

        # Download video
        download_options = {
            "outtmpl": f"{DOWNLOAD_FOLDER}/%(id)s.%(ext)s",
            "format": "best[ext=mp4]/best",
            "quiet": True
        }

        with yt_dlp.YoutubeDL(download_options) as ydl:
            downloaded_info = ydl.extract_info(url, download=True)

        # Get downloaded file details
        downloaded_video_id = downloaded_info.get("id")
        video_ext = downloaded_info.get("ext")

        # Create path to downloaded video
        video_path = os.path.join(DOWNLOAD_FOLDER, f"{downloaded_video_id}.{video_ext}")

        # Extract frames
        frame_result = extract_frames(video_path, downloaded_video_id)

        # Detect emotions
        emotion_results = detect_emotions(frame_result["frames_folder"])

        # Group emotions into better segments
        emotion_segments = group_emotions_into_better_segments(emotion_results)

        # Choose clip moments
        clip_moments = choose_clip_moments(emotion_segments, duration_seconds)

        # Create vertical clips and captions
        created_clips = create_video_clips(
            video_path,
            downloaded_video_id,
            clip_moments,
            duration_seconds
        )

        # Return result to frontend
        return {
            "message": "Video processed, vertical clips created, and captions generated successfully.",
            "title": video_title,
            "youtube_url": url,
            "duration_seconds": duration_seconds,
            "duration_minutes": duration_minutes,
            "video_path": video_path,
            "frames_saved": frame_result["frames_saved"],
            "emotion_segments": emotion_segments[:10],
            "clip_moments": clip_moments,
            "created_clips": created_clips
        }

    except Exception as e:
        return {
            "error": "Could not process the YouTube video.",
            "details": str(e)
        }