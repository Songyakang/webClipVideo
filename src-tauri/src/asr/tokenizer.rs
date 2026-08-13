/// Whisper tokenizer implementation.
///
/// Loads a HuggingFace `tokenizer.json` file and provides encode/decode for
/// Whisper ASR. The tokenizer is GPT-2 BPE based with additional multilingual
/// and timestamp special tokens.
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Whisper special token constants.
pub mod special {
    pub const START_OF_TRANSCRIPT: &str = "<|startoftranscript|>";
    pub const END_OF_TEXT: &str = "<|endoftext|>";
    pub const TRANSCRIBE: &str = "<|transcribe|>";
    pub const TRANSLATE: &str = "<|translate|>";
    pub const NO_TIMESTAMPS: &str = "<|notimestamps|>";
    pub const BEGIN_TIMESTAMP: &str = "<|0.00|>";

    /// Timestamp token increment in seconds (0.02s per token).
    pub const TIMESTAMP_STEP: f32 = 0.02;

    /// Format a language token string like "<|zh|>".
    pub fn format_language(lang: &str) -> String {
        format!("<|{}|>", lang)
    }
}

/// A lightweight Whisper tokenizer backed by a vocab map.
pub struct WhisperTokenizer {
    /// Token string → token ID
    vocab: HashMap<String, u32>,
    /// Token ID → token string
    reverse_vocab: HashMap<u32, String>,
    /// Special token IDs, lazy-computed
    sot_id: u32,
    eot_id: u32,
    transcribe_id: u32,
    translate_id: u32,
    no_timestamps_id: u32,
    /// First timestamp token ID (<|0.00|>)
    timestamp_begin_id: u32,
}

#[allow(dead_code)]
impl WhisperTokenizer {
    /// Load a tokenizer from a HuggingFace `tokenizer.json` file.
    pub fn load(path: &Path) -> Result<Self, String> {
        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read tokenizer: {}", e))?;
        let json: Value =
            serde_json::from_str(&content).map_err(|e| format!("Invalid tokenizer JSON: {}", e))?;

        // Extract model.vocab
        let model = json
            .get("model")
            .ok_or("Missing 'model' in tokenizer.json")?;
        let vocab_obj = model
            .get("vocab")
            .ok_or("Missing 'model.vocab' in tokenizer.json")?;
        let vocab_map = vocab_obj
            .as_object()
            .ok_or("'model.vocab' is not an object")?;

        let mut vocab: HashMap<String, u32> = HashMap::with_capacity(vocab_map.len());
        let mut reverse_vocab: HashMap<u32, String> = HashMap::with_capacity(vocab_map.len());

        for (token, id_val) in vocab_map {
            let id = id_val.as_u64().ok_or("Non-integer vocab value")? as u32;
            vocab.insert(token.clone(), id);
            reverse_vocab.insert(id, token.clone());
        }

        let sot_id = *vocab
            .get(special::START_OF_TRANSCRIPT)
            .ok_or("Missing <|startoftranscript|> token")?;
        let eot_id = *vocab
            .get(special::END_OF_TEXT)
            .ok_or("Missing <|endoftext|> token")?;
        let transcribe_id = *vocab
            .get(special::TRANSCRIBE)
            .ok_or("Missing <|transcribe|> token")?;
        let translate_id = *vocab
            .get(special::TRANSLATE)
            .ok_or("Missing <|translate|> token")?;
        let no_timestamps_id = *vocab
            .get(special::NO_TIMESTAMPS)
            .ok_or("Missing <|notimestamps|> token")?;
        let timestamp_begin_id = *vocab
            .get(special::BEGIN_TIMESTAMP)
            .ok_or("Missing <|0.00|> timestamp token")?;

        Ok(Self {
            vocab,
            reverse_vocab,
            sot_id,
            eot_id,
            transcribe_id,
            translate_id,
            no_timestamps_id,
            timestamp_begin_id,
        })
    }

    // ---- Accessors ----

    pub fn sot_id(&self) -> u32 {
        self.sot_id
    }
    pub fn eot_id(&self) -> u32 {
        self.eot_id
    }
    pub fn transcribe_id(&self) -> u32 {
        self.transcribe_id
    }
    pub fn translate_id(&self) -> u32 {
        self.translate_id
    }
    pub fn no_timestamps_id(&self) -> u32 {
        self.no_timestamps_id
    }
    pub fn timestamp_begin_id(&self) -> u32 {
        self.timestamp_begin_id
    }

    /// Get the language token ID for a language code (e.g. "zh", "en", "ja").
    pub fn lang_id(&self, lang: &str) -> Result<u32, String> {
        let token = special::format_language(lang);
        self.vocab
            .get(&token)
            .copied()
            .ok_or_else(|| format!("Unknown language: {}", lang))
    }

    // ---- Encoding ----

    /// Get a single token ID by its string.
    pub fn token_to_id(&self, token: &str) -> Option<u32> {
        self.vocab.get(token).copied()
    }

    /// Build the initial prompt token sequence for whisper decoding.
    ///
    /// Format: [sot, lang, task, notimestamps] + optional initial timestamp
    pub fn build_prompt(
        &self,
        lang: &str,
        task: TranscriptionTask,
        with_timestamps: bool,
    ) -> Result<Vec<u32>, String> {
        let lang_id = self.lang_id(lang)?;
        let task_id = match task {
            TranscriptionTask::Transcribe => self.transcribe_id,
            TranscriptionTask::Translate => self.translate_id,
        };

        let mut prompt = vec![self.sot_id, lang_id, task_id];
        if !with_timestamps {
            prompt.push(self.no_timestamps_id);
        }
        Ok(prompt)
    }

    // ---- Decoding ----

    /// Decode a sequence of token IDs into text.
    ///
    /// Filters out special tokens (timestamps, language, control) and
    /// concatenates the remaining text tokens with proper spacing.
    pub fn decode(&self, token_ids: &[u32]) -> String {
        let mut text = String::new();
        for &id in token_ids {
            if self.is_special(id) {
                continue;
            }
            if let Some(token) = self.reverse_vocab.get(&id) {
                // GPT-2 BPE: "Ġ" prefix → space
                let bytes = token.as_bytes();
                if bytes.first() == Some(&0xC4) && bytes.get(1) == Some(&0xA0) {
                    // Ġ (U+0120) → space
                    text.push(' ');
                    text.push_str(&token[2..]); // Skip the 2-byte UTF-8 Ġ
                } else {
                    text.push_str(token);
                }
            }
        }
        // Apply GPT-2 specific byte-level decoding for any remaining byte tokens
        text.trim().to_string()
    }

    /// Decode tokens with timestamp extraction.
    ///
    /// Returns a list of `(start_secs, end_secs, text)` segments.
    pub fn decode_with_timestamps(&self, token_ids: &[u32]) -> Vec<(f32, f32, String)> {
        let mut segments: Vec<(f32, f32, String)> = Vec::new();
        let mut current_text = String::new();
        let mut current_start: Option<f32> = None;

        for &id in token_ids {
            if id == self.eot_id {
                break;
            }
            if id == self.sot_id
                || id == self.transcribe_id
                || id == self.translate_id
                || id == self.no_timestamps_id
                || self.is_language_token(id)
            {
                continue;
            }
            if self.is_timestamp(id) {
                let time = self.timestamp_to_seconds(id);
                if let Some(start) = current_start {
                    // End of a segment
                    let text = current_text.trim().to_string();
                    if !text.is_empty() {
                        segments.push((start, time, text));
                    }
                    current_text = String::new();
                    current_start = Some(time);
                } else {
                    current_start = Some(time);
                }
            } else if let Some(token) = self.reverse_vocab.get(&id) {
                let bytes = token.as_bytes();
                if bytes.first() == Some(&0xC4) && bytes.get(1) == Some(&0xA0) {
                    current_text.push(' ');
                    current_text.push_str(&token[2..]);
                } else {
                    current_text.push_str(token);
                }
            }
        }

        // Flush last segment if it hasn't been closed by a timestamp
        if let Some(start) = current_start {
            let text = current_text.trim().to_string();
            if !text.is_empty() {
                segments.push((start, start + 1.0, text));
            }
        }

        segments
    }

    // ---- Token classification ----

    fn is_special(&self, id: u32) -> bool {
        self.is_known_special(id)
            || self.is_language_token(id)
            || self.is_timestamp(id)
    }

    fn is_timestamp(&self, id: u32) -> bool {
        if let Some(token) = self.reverse_vocab.get(&id) {
            // Timestamp format: <|0.00|> through <|30.00|>
            // Inner content matches "digit(s).digit(s)" pattern
            if token.starts_with("<|") && token.ends_with("|>") {
                let inner = &token[2..token.len() - 2];
                inner.contains('.')
                    && inner
                        .chars()
                        .all(|c| c.is_ascii_digit() || c == '.')
            } else {
                false
            }
        } else {
            false
        }
    }

    fn is_language_token(&self, id: u32) -> bool {
        // Language tokens are <|xx|> where xx is 2-3 lowercase letters
        if let Some(token) = self.reverse_vocab.get(&id) {
            token.starts_with("<|")
                && token.ends_with("|>")
                && !self.is_timestamp(id)
                && !self.is_known_special(id)
        } else {
            false
        }
    }

    /// Known special tokens that are neither language nor timestamps.
    fn is_known_special(&self, id: u32) -> bool {
        id == self.sot_id
            || id == self.eot_id
            || id == self.transcribe_id
            || id == self.translate_id
            || id == self.no_timestamps_id
    }

    fn timestamp_to_seconds(&self, id: u32) -> f32 {
        (id - self.timestamp_begin_id) as f32 * special::TIMESTAMP_STEP
    }

    /// Size of the vocabulary.
    pub fn vocab_size(&self) -> usize {
        self.vocab.len()
    }
}

/// Task type for Whisper.
#[derive(Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum TranscriptionTask {
    Transcribe,
    Translate,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_tokenizer_json() -> String {
        // Minimal tokenizer.json with just enough for testing
        r#"{
            "version": "1.0",
            "model": {
                "type": "BPE",
                "vocab": {
                    "<|startoftranscript|>": 0,
                    "<|endoftext|>": 1,
                    "<|transcribe|>": 2,
                    "<|translate|>": 3,
                    "<|notimestamps|>": 4,
                    "<|zh|>": 5,
                    "<|en|>": 6,
                    "<|0.00|>": 7,
                    "<|0.02|>": 8,
                    "<|0.04|>": 9,
                    "<|1.00|>": 57,
                    "hello": 100,
                    "Ġworld": 101,
                    "Ġ你好": 102
                }
            }
        }"#
        .to_string()
    }

    fn create_test_tokenizer() -> (WhisperTokenizer, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tokenizer.json");
        std::fs::write(&path, make_test_tokenizer_json()).unwrap();
        let tok = WhisperTokenizer::load(&path).unwrap();
        (tok, dir)
    }

    #[test]
    fn test_load_tokenizer() {
        let (tok, _path) = create_test_tokenizer();
        assert_eq!(tok.sot_id(), 0);
        assert_eq!(tok.eot_id(), 1);
        assert_eq!(tok.lang_id("zh").unwrap(), 5);
        assert_eq!(tok.lang_id("en").unwrap(), 6);
    }

    #[test]
    fn test_build_prompt() {
        let (tok, _path) = create_test_tokenizer();
        let prompt = tok
            .build_prompt("zh", TranscriptionTask::Transcribe, false)
            .unwrap();
        assert_eq!(prompt, vec![0, 5, 2, 4]);
    }

    #[test]
    fn test_decode_basic() {
        let (tok, _path) = create_test_tokenizer();
        let text = tok.decode(&[100, 101]);
        assert_eq!(text, "hello world");
    }

    #[test]
    fn test_decode_filters_special_tokens() {
        let (tok, _path) = create_test_tokenizer();
        let text = tok.decode(&[0, 5, 2, 4, 100, 101, 1]); // SOT LANG TRANSCRIBE NOTIMESTAMPS hello world EOT
        assert_eq!(text, "hello world");
    }

    #[test]
    fn test_decode_with_timestamps() {
        let (tok, _path) = create_test_tokenizer();
        // SOT zh TRANSCRIBE <|0.00|> hello <|1.00|> world <|endoftext|>
        let segments = tok.decode_with_timestamps(&[0, 5, 2, 7, 100, 57, 101, 1]);
        assert_eq!(segments.len(), 2);
        assert!((segments[0].0 - 0.0).abs() < 0.001);
        assert!((segments[0].1 - 1.0).abs() < 0.001);
        assert_eq!(segments[0].2, "hello");
        assert!((segments[1].0 - 1.0).abs() < 0.001);
        // The second segment end time depends on whether it has a closing timestamp
    }

    #[test]
    fn test_is_timestamp() {
        let (tok, _path) = create_test_tokenizer();
        assert!(tok.is_timestamp(7)); // <|0.00|>
        assert!(tok.is_timestamp(8)); // <|0.02|>
        assert!(tok.is_timestamp(57)); // <|1.00|>
        assert!(!tok.is_timestamp(0)); // SOT
        assert!(!tok.is_timestamp(100)); // regular token
    }
}
