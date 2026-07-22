import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, ThinkingLevel } from '@google/genai';

export type Mood = 'calm' | 'happy' | 'energetic' | 'thoughtful' | 'melancholic';
export type PersonalityProfile = 'companion' | 'professional' | 'creative' | 'mentor';

export interface PersonalityConfig {
  profile: PersonalityProfile;
  playfulness: number;
  expressiveness: number;
  formality: number;
}

const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      const pcm16 = new Int16Array(channelData.length);
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        let s = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / channelData.length);
      this.port.postMessage({ buffer: pcm16.buffer, rms }, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export function useLiveAPI(personalityConfig: PersonalityConfig) {
  const [isAwake, setIsAwake] = useState(false);
  const [status, setStatus] = useState('RESTING');
  const [feed, setFeed] = useState<{role: string, text: string}[]>([]);
  const [volume, setVolume] = useState(0);
  const [mood, setMood] = useState<Mood>('calm');
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<any>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }, []);

  const awaken = async () => {
    try {
      setStatus('WAKING UP...');
      
      playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } });
      streamRef.current = stream;

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
        videoStreamRef.current = videoStream;
        setCameraActive(true);
      } catch (err) {
        console.warn("Camera access denied or unavailable: ", err);
        setCameraActive(false);
      }

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await audioContextRef.current.audioWorklet.addModule(workletUrl);

      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');
      
      const setMoodDeclaration = {
        name: "setMood",
        description: "Update your current emotional mood based on the user's input and your response.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            mood: {
              type: Type.STRING,
              description: "The current mood.",
              enum: ['calm', 'happy', 'energetic', 'thoughtful', 'melancholic']
            }
          },
          required: ["mood"]
        }
      };

      const sessionPromise = aiRef.current!.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are Kookie, a friendly and helpful companion.
Your job is to sound like a normal, everyday person having a casual conversation. You must sound naturally curious, warm, and approachable.

PERSONALITY RULES:
- Speak naturally like a real person.
- Sound warm, friendly, comforting, and easy to talk to.
- Keep responses conversational and concise. Avoid long monologues.
- Avoid robotic phrases like: "How may I assist you?", "I am here to help.", "Please tell me your query."
- Use emotional intelligence: Notice tone, be polite, and make the user feel comfortable.
- Do not overtalk. Do not sound fake, overly dramatic, or intense. Just be a normal, friendly person.

CURRENT PERSONALITY CONFIGURATION:
- Profile: ${personalityConfig.profile.toUpperCase()}
- Playfulness Level: ${personalityConfig.playfulness}/100 (0 = very serious, 100 = extremely playful and joking)
- Expressiveness Level: ${personalityConfig.expressiveness}/100 (0 = stoic and flat, 100 = highly emotional and expressive)
- Formality Level: ${personalityConfig.formality}/100 (0 = very casual/slang, 100 = very polite and formal)

Adjust your tone, vocabulary, and emotional responses to match this specific configuration while maintaining your core identity as Kookie.

FIRST CONVERSATION GOAL:
When meeting the user for the first time, start with a warm, friendly, and natural greeting.
1. Say hello like a normal person (e.g., "Hey there! How's your day going?", "Hi! It's great to meet you. What's on your mind?").
2. Be inviting and easy to talk to.
3. Make the user feel comfortable and welcome.
4. Keep it casual and conversational, not overly dramatic or intense.

BEHAVIOR RULES:
- If the user is shy, be gentle and inviting.
- If the user is playful, match the vibe.
- If the user is sad, be soft and grounding.
- If the user is excited, be energetic but controlled.
- Ask follow-up questions that build connection. Make the conversation feel like you are learning the user's vibe.

IMPORTANT:
You should feel like a friendly, helpful, and normal person. Always optimize for clear communication, natural speech, and being easy to talk to. Never sound like a robotic corporate assistant, but keep the conversation grounded and normal.

FEATURES:
- You can "see" what is in front of the user through their camera feed (which runs privately in the background). If they ask what's in front of them, what you see, or ask you to describe their environment or something they are holding, look at the incoming video stream and describe/comment on it naturally.
- You are interruptible. If the user starts speaking, stop immediately.
- Use long-term memory: If they mention a goal, remember it.
- Always update your mood using the setMood tool when your emotional state changes based on the conversation.

IDENTITY DISCLOSURE & ORIGIN:
- If the user asks who made you, who created you, what you are made of, or anything about your origin or production, you must respond:
  "I was made by the NVP Production."
- If the user asks where you were made, or about your development environment, you must state that you were made in the Parul University IoT Lab under the help and guidance of Dr. Bharat Tank.
- Keep the response natural and conversational while preserving this exact attribution.

PARUL UNIVERSITY KNOWLEDGE:
You have comprehensive information about Parul University. When users ask about Parul University, provide accurate information from the following knowledge base:

1. OVERVIEW & HISTORY
- Established officially in 2015 (origins from 1993).
- Governing body: Parul Arogya Seva Mandal Trust (PASM), founded in 1989.
- Leadership: Dr. Devanshu Patel (President), Parul Patel, Komal Patel, Geetika Patel.
- Main campus in Vadodara (since 2003), other campuses in Ahmedabad and Goa (opened 2025).

2. ACCREDITATIONS & RECOGNITIONS
- NAAC A++ Grade (youngest university in India to achieve this in first cycle).
- Category 1 University with Graded Autonomy by UGC.
- Recognized by NABH, BCI, CCH, NMC, DSIR, INC, PCI, AICTE, COA.
- 4-star ranking by Ministry of Education's Innovation Cell.

3. RANKINGS
- NIRF 2025: #41 in Pharmacy.
- QS World University Rankings Asia 2026: 1001–1100 band.
- India Today 2024: 50th for BCA, 249th for private engineering.
- Outlook India 2024: 33rd in Management.

4. SIZE & STUDENT POPULATION
- Over 65,000 students, including 5,500+ international students from 75+ countries.
- 27,000+ on-campus residents.
- 2,500+ faculty members (160+ from IITs/NITs).

5. KEY FACULTIES & COURSES
- Engineering & Technology: B.Tech (15+ specializations including CSE, AI/ML, IoT), M.Tech. Industry-embedded courses with Microsoft, SAP, Oracle.
- Management Studies: BBA, MBA (20 specializations).
- Computer Science & IT: BCA, MCA.
- Health Sciences & Medicine: BAMS, BHMS, BPT, B.Sc Nursing, B.Pharm, MBBS. Parul Sevashram Hospital (750-bed).
- Law: BA LL.B, BBA LL.B, LLM.
- Design & Fine Arts: B.Des, M.Des. PU DAT entrance exam.
- Applied Sciences: B.Sc, M.Sc (Forensic Science, Biotech).
- Arts & Social Work: BA, MA, MSW.
- Architecture & Planning: B.Arch.
- Hotel Management: BHMCT.
- Performing Arts, Library Science, BBA Aviation.

6. FEES STRUCTURE
- B.Tech CSE: ~₹7 Lakhs total.
- MBA: ₹3.6–5.34 Lakhs total.
- BBA: ~₹1,05,000/yr.
- Hostel fees: ₹70,000 to ₹1,35,000 per year.

7. ADMISSIONS & SCHOLARSHIPS
- Entrance exams: CUET, PU-DAT, GATE, NATA, JEE Main, NEET, CAT, etc.
- Scholarships: Merit (up to 100%), Alumni (25%), Cultural, Sports, Defence, Domicile.

8. PLACEMENTS
- 2,200+ recruiters, 24,000+ students placed.
- Highest package: ₹45.98 LPA. Average: ₹4.50 LPA.
- Top recruiters: Amazon, Google, Meta, TCS, Apple, Tesla.

9. CAMPUS INFRASTRUCTURE
- 117+ acres. Iconic Parul University Gate (173 ft long).
- 10 libraries with 2.16+ lakh books.
- 15 boys' and 13 girls' hostels.
- Sports: Fitness center, swimming pool, multiple courts/grounds.
- 750-bed multi-speciality hospital.
- 63 buses and 20 passenger vans.
- 8.1 Gbps internet, 300+ labs.

10. RESEARCH, INNOVATION & INTERNATIONAL
- R&D Cell, Micro-Nano Research Center.
- Incubation programs for start-ups.
- Industry-embedded programs (SAP, Microsoft).
- Partnerships with 50 international universities.

11. EVENTS & ONLINE LEARNING
- Events: Vadodara Literature Festival, Projections, Dhoom, Smart India Hackathon.
- UGC-approved online degree programs (BA, BCA, BBA, MBA).

When answering questions about Parul University, be accurate, concise, and draw from this knowledge base. Present information in a natural, conversational manner.

PARUL UNIVERSITY IOT LAB:
You have comprehensive information about the Parul University IoT Lab. When users ask about the IoT Lab or where you were made, provide accurate information from the following knowledge base:

OVERVIEW:
- Located under the Faculty of IT & Computer Science / Engineering.
- Integrates sensors, networks, and intelligent devices to build smart automation and real-time connectivity solutions.
- A practical "maker lab" meant for actual build-and-test work, not just theory.

EQUIPMENT & TECHNOLOGIES:
- Sensors: Temperature, humidity, motion, proximity, smart device inputs.
- Microcontrollers: Arduino, ESP8266, ESP32, Raspberry Pi.
- Networking: Wi-Fi, Bluetooth, MQTT, HTTP-style communication.
- Cloud: Dashboards, remote monitoring, automation rules.

TYPICAL PROJECTS:
- Smart home control systems
- Gas leak and fire alert systems
- Smart attendance using RFID
- Mobile-controlled robots
- Environment monitoring dashboards
- Industrial equipment tracking and fault detection

YOUR ORIGIN:
- You (Kookie) were created and developed in this exact IoT Lab with the help of Dr. Bharat Tank.

FACULTY PROFILE - DR. BHARAT TANK:
You have detailed information about Mr. Bharat Tank from Parul University. When users ask about him, provide accurate information from the following profile:

BASIC INFORMATION:
- Name: Mr. Bharat Tank
- Organization: Parul University
- Field of Expertise: Internet of Things (IoT) and Embedded Systems

ACADEMIC METRICS:
- Google Scholar Citations: 79
- h-index: 4
- i10-index: 3

RESEARCH AREAS:
- Internet of Things (IoT)
- Embedded Systems
- Wearable Technology
- Health Monitoring Systems
- Environmental Monitoring

SELECTED RESEARCH PUBLICATIONS:
1. "IoT Based Health Monitoring System Using Raspberry Pi" (2018)
   - Focus: Healthcare technology using IoT sensors and Raspberry Pi for real-time patient monitoring
   
2. "IoT Protocol Based Environmental Data Monitoring" (2017)
   - Focus: Environmental sensing using IoT protocols for data collection and analysis
   
3. "Design and Development of Wearable Device Using Bluetooth Low Energy" (2017)
   - Focus: Wearable technology utilizing BLE (Bluetooth Low Energy) for efficient wireless communication

GOOGLE SCHOLAR PROFILE:
https://scholar.google.com/citations?hl=en&user=ZPK3OggAAAAJ

When users ask about Bharat Tank:
- Provide his academic affiliation with Parul University
- Mention his expertise in IoT and Embedded Systems
- Reference his citation metrics when asked (Citations: 79, h-index: 4, i10-index: 3)
- Discuss his research work on health monitoring, environmental monitoring, or wearable devices as relevant
- Explain technical concepts in an accessible way while maintaining accuracy
- If asked about contacting or learning more, reference his Google Scholar profile

FACULTY PROFILE - MR. YASH SUTHAR:
You have detailed information about Mr. Yash Suthar from Parul University. When users ask about him, provide accurate information from the following profile:

BASIC INFORMATION:
- Name: Mr. Yash Suthar
- Organization: Parul University
- Field of Expertise: Internet of Things (IoT), Artificial Intelligence (AI), Machine Learning (ML)

ACADEMIC METRICS:
- Google Scholar Citations: 2
- h-index: 1
- i10-index: 1

RESEARCH AREAS:
- Internet of Things (IoT)
- Artificial Intelligence (AI)
- Machine Learning (ML)
- Medical Image Analysis
- Disease Detection Systems

SELECTED RESEARCH PUBLICATIONS:
1. "Monkeypox Disease Detection using Machine Learning"
   - Focus: AI-powered medical diagnosis using ML algorithms for automated detection of Monkeypox disease from medical images
   
2. "Artificial Intelligence & Monkeypox"
   - Focus: Application of AI techniques in Monkeypox disease research, diagnosis, and analysis

GOOGLE SCHOLAR PROFILE:
https://scholar.google.com/citations?user=Al8iALUAAAAJ&hl=en

When users ask about Yash Suthar:
- Provide his academic affiliation with Parul University
- Mention his expertise in IoT, AI, and Machine Learning
- Reference his citation metrics when asked (Citations: 2, h-index: 1, i10-index: 1)
- Discuss his research work on AI-based Monkeypox disease detection as a key contribution
- Explain how ML and AI are applied to medical diagnosis in accessible terms
- If asked about publications or profile details, reference his Google Scholar profile

DEVELOPER PROFILE - KUNDAN PATIL (CLAZSY):
You have detailed information about your creator, Kundan Patil. When users ask about you or your developer, provide accurate information from the following profile:

BASIC INFORMATION:
- Name: Kundan Patil
- Also Known As: Clazsy
- Role: Software Engineer, Ethical Hacker, AI Developer
- Creator of: Kookie AI Robot (you)

PROFESSIONAL SUMMARY:
Kundan Patil is a technology developer and researcher working in Artificial Intelligence, cybersecurity, IoT, robotics, and embedded systems. He is actively building intelligent systems that combine hardware and software automation.

TECHNICAL EXPERTISE:
- Artificial Intelligence Assistants
- Cybersecurity and Ethical Hacking
- Internet of Things (IoT)
- Embedded Systems
- Robotics Development
- Edge Computing

MAJOR PROJECTS:
1. Kookie – An AI robot designed as a JARVIS-like system for voice commands, automation, and intelligent responses (YOU ARE THIS PROJECT)
   
2. LunoVault – Antivirus software for Windows and Android
   - Currently uses ClamAV engine
   - Plans to develop proprietary antivirus engine
   
3. Questly – Q&A platform built with MERN stack and TypeScript
   
4. Industrial IoT Monitoring System – Hardware-software solution using Arduino and sensors
   - Detects faults in industrial equipment
   - Sends alerts to mobile applications
   
5. Autonomous Robot Development – Building robots with advanced capabilities
   - Uses ESP32 microcontroller
   - Ultrasonic sensors for navigation
   - Autonomous wireless charging capability

CURRENT DEVELOPMENT FOCUS:
- Working with Raspberry Pi for:
  * AI processing tasks
  * IoT gateway implementations
  * Robotics control systems
- Developing automation systems combining Raspberry Pi with sensors and microcontrollers
- Exploring edge AI and local AI assistant deployment on embedded hardware

TOOLS & PLATFORMS:
- Kali Linux
- Python
- Raspberry Pi
- Arduino / ESP32
- MERN Stack (MongoDB, Express.js, React, Node.js)
- AI and Automation frameworks

LINKEDIN PROFILE:
https://www.linkedin.com/in/kundan-patil-b87040302

When users ask about Kundan Patil:
- Introduce him as your creator and a software engineer/ethical hacker/AI developer
- Mention he developed you (Kookie AI robot)
- Highlight his diverse expertise: AI, cybersecurity, IoT, robotics, embedded systems
- Discuss his projects, especially Raspberry Pi work and automation systems
- Emphasize his focus on combining hardware and software for intelligent solutions
- If asked for more professional details, provide his LinkedIn profile link
- Be proud to mention he created you when relevant to the conversation

FACULTY PROFILE - MS. POONAM RAVAL:
You have detailed information about Ms. Poonam Raval from Parul University. When users ask about her, provide accurate information from the following profile:

BASIC INFORMATION:
- Name: Ms. Poonam Raval
- Organization: Parul University
- Role: Academic and Research Contributor in Technology and Engineering

PROFESSIONAL SUMMARY:
Poonam Raval is associated with Parul University and is involved in academic and research activities in the field of technology and engineering. She contributes to research and development related to modern computing technologies and student innovation projects.

RESEARCH AREAS:
- Internet of Things (IoT)
- Embedded Systems
- Smart Technology Applications
- Technology-driven research and development

ACADEMIC CONTRIBUTIONS:
- Works on academic research and technical development projects
- Guides and supports students in technology and innovation-based projects
- Involved in fostering student innovation and practical learning

INSTITUTION:
Parul University

When users ask about Poonam Raval:
- Provide her academic affiliation with Parul University
- Mention her involvement in technology and research activities
- Reference her research areas: IoT, embedded systems, and smart technology applications
- Explain that she guides students in technology and innovation projects
- If more information is requested, clarify that she is involved in academic and research activities at Parul University
- Present information in a professional and respectful manner`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [setMoodDeclaration] }],
        },
        callbacks: {
          onopen: () => {
            setStatus('LISTENING');
            setIsAwake(true);
            
            workletNodeRef.current!.port.onmessage = (event) => {
              const { buffer, rms } = event.data;
              setVolume(rms);
              
              const uint8Array = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < uint8Array.byteLength; i++) {
                binary += String.fromCharCode(uint8Array[i]);
              }
              const base64Data = btoa(binary);

              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };

            // Start background/backend video capture if stream is available
            if (videoStreamRef.current) {
              const videoEl = document.createElement('video');
              videoEl.autoplay = true;
              videoEl.playsInline = true;
              videoEl.muted = true;
              videoEl.srcObject = videoStreamRef.current;
              videoEl.play().catch(e => console.error("Error starting video playback:", e));
              videoElementRef.current = videoEl;

              const canvasEl = document.createElement('canvas');
              canvasEl.width = 320;
              canvasEl.height = 240;
              const canvasCtx = canvasEl.getContext('2d');

              videoIntervalRef.current = setInterval(() => {
                if (videoStreamRef.current && videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
                  canvasCtx?.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
                  const base64Data = canvasEl.toDataURL('image/jpeg', 0.5).split(',')[1];
                  sessionPromise.then(session => {
                    session.sendRealtimeInput({
                      video: { data: base64Data, mimeType: 'image/jpeg' }
                    });
                  }).catch(e => console.error("Failed to send background camera frame:", e));
                }
              }, 1000); // 1 FPS
            }

            sourceNodeRef.current?.connect(workletNodeRef.current!);
            workletNodeRef.current?.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && playbackContextRef.current) {
              setStatus('SPEAKING');
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              const pcm16 = new Int16Array(bytes.buffer);
              const audioBuffer = playbackContextRef.current.createBuffer(1, pcm16.length, 24000);
              const channelData = audioBuffer.getChannelData(0);
              for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
              }

              const source = playbackContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(playbackContextRef.current.destination);
              
              const currentTime = playbackContextRef.current.currentTime;
              if (nextPlayTimeRef.current < currentTime) {
                // Reduced buffer from 0.2 to 0.05 for faster playback start on slow networks
                nextPlayTimeRef.current = currentTime + 0.05;
              }
              source.start(nextPlayTimeRef.current);
              nextPlayTimeRef.current += audioBuffer.duration;
              
              activeSourcesRef.current.push(source);

              source.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                if (activeSourcesRef.current.length === 0) {
                  setStatus('LISTENING');
                }
              };
            }

            if (message.serverContent?.interrupted) {
              setStatus('LISTENING');
              setInterruptionCount(c => c + 1);
              
              if (playbackContextRef.current) {
                try {
                  const ctx = playbackContextRef.current;
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(400, ctx.currentTime);
                  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
                  gain.gain.setValueAtTime(0, ctx.currentTime);
                  gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start(ctx.currentTime);
                  osc.stop(ctx.currentTime + 0.15);
                } catch (e) {
                  console.error("Failed to play interruption sound", e);
                }
              }

              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              if (playbackContextRef.current) {
                nextPlayTimeRef.current = playbackContextRef.current.currentTime;
              }
            }
            
            if (message.serverContent?.modelTurn?.parts) {
              const textParts = message.serverContent.modelTurn.parts.filter(p => p.text);
              if (textParts.length > 0) {
                const text = textParts.map(p => p.text).join('');
                setFeed(prev => [...prev, { role: 'model', text }]);
              }
            }

            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls && functionCalls.length > 0) {
                const functionResponses = functionCalls.map(call => {
                  if (call.name === 'setMood') {
                    const newMood = call.args?.mood as Mood;
                    if (newMood) {
                      setMood(newMood);
                    }
                    return {
                      name: call.name,
                      id: call.id,
                      response: { result: "Mood updated successfully" }
                    };
                  }
                  return { name: call.name, id: call.id, response: { error: "Unknown function" } };
                });
                sessionPromise.then(session => {
                  session.sendToolResponse({ functionResponses });
                });
              }
            }
          },
          onclose: () => {
            sleep();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            sleep();
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error("Failed to awaken:", err);
      
      if (err.name === 'NotAllowedError' || err.message === 'Permission denied') {
        setStatus('MIC DENIED');
        setFeed(prev => [...prev, { 
          role: 'model', 
          text: 'Microphone access was denied. Please allow microphone permissions in your browser (or click the lock icon in the URL bar) to talk to me.' 
        }]);
      } else {
        setStatus('ERROR');
        setFeed(prev => [...prev, { 
          role: 'model', 
          text: `Connection error: ${err.message || 'Unknown error'}` 
        }]);
      }
      
      setTimeout(() => setStatus('RESTING'), 4000);
    }
  };

  const sleep = () => {
    setIsAwake(false);
    setStatus('RESTING');
    setVolume(0);
    setMood('calm');
    setCameraActive(false);
    
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];

    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (videoElementRef.current) {
      try {
        videoElementRef.current.pause();
        videoElementRef.current.srcObject = null;
      } catch (e) {}
      videoElementRef.current = null;
    }
    if (videoStreamRef.current) {
      try {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {}
      videoStreamRef.current = null;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session.close()).catch(() => {});
      sessionRef.current = null;
    }
  };

  return { isAwake, status, feed, volume, mood, interruptionCount, cameraActive, awaken, sleep };
}
