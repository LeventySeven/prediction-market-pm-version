
import React, { useState } from 'react';
import { X, Calendar, CheckCircle, Plus, Trash2, List, ToggleLeft } from 'lucide-react';
import Button from './Button';
import { User, Category } from '../types';
import { CATEGORIES } from '../constants';

interface SuggestMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  lang: 'RU' | 'EN';
  onSubmit: (title: string, category: Category, endDate: string) => void;
}

const SuggestMarketModal: React.FC<SuggestMarketModalProps> = ({ isOpen, onClose, user, lang, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('SOCIAL');
  const [endDate, setEndDate] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Outcome State
  const [outcomeType, setOutcomeType] = useState<'BINARY' | 'CUSTOM'>('BINARY');
  const [customOutcomes, setCustomOutcomes] = useState<string[]>(['', '']);

  if (!isOpen) return null;

  const handleAddOutcome = () => {
    setCustomOutcomes([...customOutcomes, '']);
  };

  const handleRemoveOutcome = (index: number) => {
    const newOutcomes = customOutcomes.filter((_, i) => i !== index);
    setCustomOutcomes(newOutcomes);
  };

  const handleOutcomeChange = (index: number, value: string) => {
    const newOutcomes = [...customOutcomes];
    newOutcomes[index] = value;
    setCustomOutcomes(newOutcomes);
  };

  const handleSubmit = () => {
    if (!title || !endDate) return;
    if (outcomeType === 'CUSTOM' && customOutcomes.some(o => !o.trim())) return;
    
    // Simulate submission
    setIsSuccess(true);
    setTimeout(() => {
        onSubmit(title, category, endDate);
        setIsSuccess(false);
        setTitle('');
        setEndDate('');
        setOutcomeType('BINARY');
        setCustomOutcomes(['', '']);
        onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-black border border-neutral-800 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-600 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {isSuccess ? (
             <div className="flex flex-col items-center justify-center py-10">
                <CheckCircle size={48} className="text-[#BEFF1D] mb-4 animate-bounce" />
                <h3 className="text-xl font-bold text-white mb-2">
                    {lang === 'RU' ? 'Отправлено!' : 'Submitted!'}
                </h3>
                <p className="text-neutral-500 text-sm text-center">
                    {lang === 'RU' 
                        ? 'Ваше событие отправлено на модерацию. Если оно будет одобрено, оно появится в списке с пометкой NEW.' 
                        : 'Your event has been sent for review. If approved, it will appear with a NEW badge.'}
                </p>
             </div>
        ) : (
            <>
                <h2 className="text-xl font-bold text-white mb-6 tracking-wide uppercase">
                {lang === 'RU' ? 'Предложить Событие' : 'Suggest Event'}
                </h2>

                <div className="space-y-5">
                    {/* Creator Info */}
                    <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800">
                        <span>{lang === 'RU' ? 'Создатель:' : 'Creator:'}</span>
                        <span className="text-white font-bold">{user ? user.name : (lang === 'RU' ? 'Аноним' : 'Anonymous')}</span>
                    </div>

                    {/* Question/Title */}
                    <div>
                        <label className="block text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-widest">
                            {lang === 'RU' ? 'Вопрос / Событие' : 'Question / Event'}
                        </label>
                        <input 
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={lang === 'RU' ? "Например: Вырастет ли BTC до 100к?" : "E.g., Will BTC hit 100k?"}
                            className="w-full bg-black border border-neutral-800 rounded-lg p-3 text-white text-sm focus:border-[#BEFF1D] focus:outline-none transition-colors placeholder:text-neutral-800"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-widest">
                            {lang === 'RU' ? 'Категория' : 'Category'}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.filter(c => c.id !== 'ALL').map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-all ${category === cat.id ? 'bg-[#BEFF1D] text-black border-[#BEFF1D]' : 'bg-transparent text-neutral-500 border-neutral-800 hover:border-neutral-600'}`}
                                >
                                    {lang === 'RU' ? cat.labelRU : cat.labelEN}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="block text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-widest">
                            {lang === 'RU' ? 'Дата завершения' : 'End Date'}
                        </label>
                        <div className="relative">
                            <input 
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-black border border-neutral-800 rounded-lg p-3 pl-10 text-white text-sm focus:border-[#BEFF1D] focus:outline-none transition-colors [color-scheme:dark]"
                            />
                            <Calendar size={16} className="absolute left-3 top-3 text-neutral-500" />
                        </div>
                    </div>

                    {/* Outcome Type Selection */}
                    <div>
                        <label className="block text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-widest">
                            {lang === 'RU' ? 'Тип исхода' : 'Outcome Type'}
                        </label>
                        <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-1">
                            <button 
                                onClick={() => setOutcomeType('BINARY')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase transition-all ${outcomeType === 'BINARY' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                <ToggleLeft size={14} />
                                {lang === 'RU' ? 'Да / Нет' : 'Yes / No'}
                            </button>
                            <button 
                                onClick={() => setOutcomeType('CUSTOM')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase transition-all ${outcomeType === 'CUSTOM' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                <List size={14} />
                                {lang === 'RU' ? 'Свой вариант' : 'Custom'}
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Outcome Inputs */}
                    {outcomeType === 'BINARY' ? (
                        <div className="p-4 bg-neutral-900/30 rounded-lg border border-neutral-800 flex justify-between items-center animate-fade-in">
                            <span className="text-xs text-neutral-500">{lang === 'RU' ? 'Стандартные исходы:' : 'Standard outcomes:'}</span>
                            <div className="flex gap-2">
                                    <span className="bg-neutral-800 border border-neutral-700 text-[#BEFF1D] text-[10px] font-bold px-3 py-1.5 rounded">{lang === 'RU' ? 'ДА' : 'YES'}</span>
                                    <span className="bg-neutral-800 border border-neutral-700 text-[#f544a6] text-[10px] font-bold px-3 py-1.5 rounded">{lang === 'RU' ? 'НЕТ' : 'NO'}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 animate-fade-in">
                            {customOutcomes.map((outcome, index) => (
                                <div key={index} className="flex gap-2">
                                    <input 
                                        value={outcome}
                                        onChange={(e) => handleOutcomeChange(index, e.target.value)}
                                        placeholder={lang === 'RU' ? `Вариант ${index + 1}` : `Option ${index + 1}`}
                                        className="flex-1 bg-black border border-neutral-800 rounded-lg p-3 text-white text-sm focus:border-[#BEFF1D] focus:outline-none transition-colors placeholder:text-neutral-800"
                                    />
                                    {customOutcomes.length > 2 && (
                                        <button 
                                            onClick={() => handleRemoveOutcome(index)}
                                            className="p-3 text-neutral-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button 
                                onClick={handleAddOutcome}
                                className="w-full py-2 border border-dashed border-neutral-800 hover:border-neutral-600 rounded-lg text-neutral-500 hover:text-[#BEFF1D] text-xs uppercase font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={14} />
                                {lang === 'RU' ? 'Добавить вариант' : 'Add Option'}
                            </button>
                        </div>
                    )}

                    <Button fullWidth onClick={handleSubmit} disabled={!title || !endDate || (outcomeType === 'CUSTOM' && customOutcomes.some(o => !o))}>
                        {lang === 'RU' ? 'Отправить на проверку' : 'Submit for Review'}
                    </Button>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default SuggestMarketModal;
