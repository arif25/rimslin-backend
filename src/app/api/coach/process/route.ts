import { NextRequest, NextResponse } from "next/server";
import Groq, { toFile } from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { audioBase64 } = body;

        if (!audioBase64) {
            return NextResponse.json(
                { error: "কোনো অডিও ডেটা পাওয়া যায়নি" },
                { status: 400 }
            );
        }

        // ১. Base64 থেকে বাফার তৈরি
        const audioBuffer = Buffer.from(audioBase64, "base64");

        // Groq-এর নিজস্ব toFile হেল্পার ব্যবহার (১০০% নির্ভরযোগ্য)
        const audioFile = await toFile(audioBuffer, "recording.m4a", {
            type: "audio/m4a",
        });

        // ২. স্পিচ টু টেক্সট (Groq Whisper)
        let userSpokenText = "";
        try {
            const transcription = await groq.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-large-v3-turbo",
                language: "bn",
                response_format: "json",
            });
            userSpokenText = transcription.text?.trim() || "";
        } catch (sttError: any) {
            console.error("Groq STT Error:", sttError);
            return NextResponse.json(
                { error: `STT ব্যর্থ: ${sttError.message || "অডিও পরিষ্কার নয়"}` },
                { status: 500 }
            );
        }

        if (!userSpokenText) {
            userSpokenText = "আমি স্পষ্টভাবে শুনতে পাইনি, আবার বলুন।";
        }

        // ৩. Llama 3.3 দিয়ে ট্রান্সলেশন ও হরকত জেনারেশন
        const prompt = `You are the core intelligence engine for 'Rimslin', a high-end spoken language training business app.
The user speaks Bengali and is practicing spoken communication.

User spoken text: "${userSpokenText}"

Evaluate their clarity, fluency, and sentence completeness. Provide a score from 50 to 98 (be encouraging but realistic).
Respond STRICTLY with valid JSON (no markdown formatting, no code block):
{
  "bangla": "${userSpokenText}",
  "arabic": "accurate Modern Standard Arabic with 100% full tashkeel/harakat",
  "arabicPronounce": "Bengali phonetic transliteration of Arabic text",
  "english": "Fluent and natural English translation",
  "englishPronounce": "Bengali phonetic transliteration of English",
  "hindi": "Natural spoken Hindi in Devanagari script",
  "pronunciationTip": "A 1-sentence actionable tip in Bengali on pronunciation or fluency",
  "score": 85,
  "feedbackBadge": "দারুণ হয়েছে" 
}`;


        const completion = await groq.chat.completions.create({
            model: "openai/gpt-oss-120b", // <-- বর্তমান সক্রিয় ও শক্তিশালী মডেল
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.3,
        });

        const rawResponse = completion.choices[0]?.message?.content || "{}";
        const parsedData = JSON.parse(rawResponse);

        return NextResponse.json(parsedData, { status: 200 });
    } catch (error: any) {
        console.error("Coach API Root Error:", error);
        return NextResponse.json(
            { error: error?.message || "সার্ভার প্রসেসিং ব্যর্থ হয়েছে" },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({ status: "API is working!" });
}