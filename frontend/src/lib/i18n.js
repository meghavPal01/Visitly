export const LANGS = [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }, { code: 'gu', label: 'ગુજરાતી' }]
export const T = {
  en: { greet: (n) => `Hi ${n}! I can answer questions about our projects and book a site visit for you. What are you looking for?`,
    chips: ['I’m looking for a 3 BHK', 'Can I visit tomorrow?', 'What amenities are there?'], placeholder: 'Type your message', send: 'Send',
    human: 'Talk to a person', pick: 'Pick a visit time', typing: 'Assistant is typing', next: 'Next visit', stop: 'Stop messages from Visitly',
    chatting: (n) => `${n} is chatting with you`, waiting: 'A salesperson has been asked to reply. You can keep chatting meanwhile.', teamMember: 'Sales team',
    chipsBooked: ['Can I change my visit time?', 'What amenities are there?'], chipsOpen: ['Book a site visit', 'What amenities are there?', 'What is the price range?'] },
  hi: { greet: (n) => `नमस्ते ${n}! मैं हमारे प्रोजेक्ट के बारे में सवालों के जवाब दे सकता हूँ और आपके लिए साइट विज़िट बुक कर सकता हूँ। आप क्या ढूँढ रहे हैं?`,
    chips: ['मुझे 3 BHK चाहिए', 'क्या मैं कल आ सकता हूँ?', 'कौन सी सुविधाएँ हैं?'], placeholder: 'अपना संदेश लिखें', send: 'भेजें',
    human: 'किसी व्यक्ति से बात करें', pick: 'विज़िट का समय चुनें', typing: 'सहायक लिख रहा है', next: 'अगली विज़िट', stop: 'Visitly के संदेश बंद करें',
    chatting: (n) => `${n} आपसे बात कर रहे हैं`, waiting: 'एक सेल्सपर्सन से जवाब देने को कहा गया है। तब तक आप चैट जारी रख सकते हैं।', teamMember: 'सेल्स टीम',
    chipsBooked: ['क्या मैं विज़िट का समय बदल सकता हूँ?', 'कौन सी सुविधाएँ हैं?'], chipsOpen: ['साइट विज़िट बुक करें', 'कौन सी सुविधाएँ हैं?', 'कीमत की रेंज क्या है?'] },
  gu: { greet: (n) => `નમસ્તે ${n}! હું અમારા પ્રોજેક્ટ વિશેના પ્રશ્નોના જવાબ આપી શકું છું અને તમારા માટે સાઇટ વિઝિટ બુક કરી શકું છું. તમે શું શોધી રહ્યા છો?`,
    chips: ['મને 3 BHK જોઈએ છે', 'શું હું કાલે આવી શકું?', 'કઈ સુવિધાઓ છે?'], placeholder: 'તમારો સંદેશ લખો', send: 'મોકલો',
    human: 'કોઈ વ્યક્તિ સાથે વાત કરો', pick: 'વિઝિટનો સમય પસંદ કરો', typing: 'સહાયક લખી રહ્યો છે', next: 'આગામી વિઝિટ', stop: 'Visitly ના સંદેશા બંધ કરો',
    chatting: (n) => `${n} તમારી સાથે વાત કરી રહ્યા છે`, waiting: 'સેલ્સપર્સનને જવાબ આપવા કહેવામાં આવ્યું છે. ત્યાં સુધી તમે ચેટ ચાલુ રાખી શકો છો.', teamMember: 'સેલ્સ ટીમ',
    chipsBooked: ['શું હું વિઝિટનો સમય બદલી શકું?', 'કઈ સુવિધાઓ છે?'], chipsOpen: ['સાઇટ વિઝિટ બુક કરો', 'કઈ સુવિધાઓ છે?', 'કિંમતની રેન્જ શું છે?'] },
}
