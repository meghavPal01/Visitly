export const LANGS = [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }, { code: 'gu', label: 'ગુજરાતી' }]
export const T = {
  en: { greet: (n) => `Hi ${n}! I can answer questions about our projects and book a site visit for you. What are you looking for?`,
    chips: ['I’m looking for a 3 BHK', 'Can I visit tomorrow?', 'What amenities are there?'], placeholder: 'Type your message', send: 'Send',
    human: 'Talk to a person', pick: 'Pick a visit time', typing: 'Assistant is typing', next: 'Next visit', stop: 'Stop messages from Visitly' },
  hi: { greet: (n) => `नमस्ते ${n}! मैं हमारे प्रोजेक्ट के बारे में सवालों के जवाब दे सकता हूँ और आपके लिए साइट विज़िट बुक कर सकता हूँ। आप क्या ढूँढ रहे हैं?`,
    chips: ['मुझे 3 BHK चाहिए', 'क्या मैं कल आ सकता हूँ?', 'कौन सी सुविधाएँ हैं?'], placeholder: 'अपना संदेश लिखें', send: 'भेजें',
    human: 'किसी व्यक्ति से बात करें', pick: 'विज़िट का समय चुनें', typing: 'सहायक लिख रहा है', next: 'अगली विज़िट', stop: 'Visitly के संदेश बंद करें' },
  gu: { greet: (n) => `નમસ્તે ${n}! હું અમારા પ્રોજેક્ટ વિશેના પ્રશ્નોના જવાબ આપી શકું છું અને તમારા માટે સાઇટ વિઝિટ બુક કરી શકું છું. તમે શું શોધી રહ્યા છો?`,
    chips: ['મને 3 BHK જોઈએ છે', 'શું હું કાલે આવી શકું?', 'કઈ સુવિધાઓ છે?'], placeholder: 'તમારો સંદેશ લખો', send: 'મોકલો',
    human: 'કોઈ વ્યક્તિ સાથે વાત કરો', pick: 'વિઝિટનો સમય પસંદ કરો', typing: 'સહાયક લખી રહ્યો છે', next: 'આગામી વિઝિટ', stop: 'Visitly ના સંદેશા બંધ કરો' },
}
