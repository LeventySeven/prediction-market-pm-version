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
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      ></div>
      <div className="relative bg-[#09090b] border border-zinc-800 w-full max-w-md rounded-xl p-6 shadow-lg animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-black transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#E70024] focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X size={16} className="text-zinc-400" />
        </button>

        {isSuccess ? (
             <div className="flex flex-col items-center justify-center py-10">
                <CheckCircle size={48} className="text-[#E70024] mb-4 animate-bounce" />
                <h3 className="text-xl font-semibold tracking-tight text-white mb-2">
                    {lang === 'RU' ? 'Отправлено!' : 'Submitted!'}
                </h3>
                <p className="text-zinc-500 text-sm text-center">
                    {lang === 'RU' 
                        ? 'Ваше событие отправлено на модерацию. Если оно будет одобрено, оно появится в списке с пометкой NEW.' 
                        : 'Your event has been sent for review. If approved, it will appear with a NEW badge.'}
                </p>
             </div>
        ) : (
            <>
                <div className="mb-6">
                    <h2 className="text-lg font-semibold tracking-tight text-white">
                        {lang === 'RU' ? 'Предложить Событие' : 'Suggest Event'}
                    </h2>
                    <p className="text-sm text-zinc-500">
                        {lang === 'RU' ? 'Создайте новый рынок для предсказаний.' : 'Create a new prediction market.'}
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Creator Info */}
                    <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900/50 p-2 rounded-md border border-zinc-800">
                        <span>{lang === 'RU' ? 'Создатель:' : 'Creator:'}</span>
                        <span className="text-white font-medium">{user ? user.name : (lang === 'RU' ? 'Аноним' : 'Anonymous')}</span>
                    </div>

                    {/* Question/Title */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-300">
                            {lang === 'RU' ? 'Вопрос / Событие' : 'Question / Event'}
                        </label>
                        <input 
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={lang === 'RU' ? "Например: Вырастет ли BTC до 100к?" : "E.g., Will BTC hit 100k?"}
                            className="flex h-9 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E70024] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    {/* Category */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none text-zinc-300">
                            {lang === 'RU' ? 'Категория' : 'Category'}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.filter(c => c.id !== 'ALL').map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${category === cat.id ? 'bg-[#E70024] text-white border-[#E70024]' : 'bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300'}`}
                                >
                                    {lang === 'RU' ? cat.labelRU : cat.labelEN}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none text-zinc-300">
                            {lang === 'RU' ? 'Дата завершения' : 'End Date'}
                        </label>
                        <div className="relative">
                            <input 
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-zinc-800 bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E70024] [color-scheme:dark]"
                            />
                            <Calendar size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                        </div>
                    </div>

                    {/* Outcome Type Selection */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none text-zinc-300">
                            {lang === 'RU' ? 'Тип исхода' : 'Outcome Type'}
                        </label>
                        <div className="flex bg-zinc-900 border border-zinc-800 rounded-md p-1">
                            <button 
                                onClick={() => setOutcomeType('BINARY')}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-sm text-xs font-medium transition-all ${outcomeType === 'BINARY' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <ToggleLeft size={14} />
                                {lang === 'RU' ? 'Да / Нет' : 'Yes / No'}
                            </button>
                            <button 
                                onClick={() => setOutcomeType('CUSTOM')}
                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-sm text-xs font-medium transition-all ${outcomeType === 'CUSTOM' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <List size={14} />
                                {lang === 'RU' ? 'Свой вариант' : 'Custom'}
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Outcome Inputs */}
                    {outcomeType === 'BINARY' ? (
                        <div className="p-4 bg-zinc-900/30 rounded-md border border-zinc-800 flex justify-between items-center">
                            <span className="text-xs text-zinc-500">{lang === 'RU' ? 'Стандартные исходы:' : 'Standard outcomes:'}</span>
                            <div className="flex gap-2">
                                    <span className="bg-zinc-800 border border-zinc-700 text-[#E70024] text-[10px] font-bold px-2 py-1 rounded-sm">{lang === 'RU' ? 'ДА' : 'YES'}</span>
                                    <span className="bg-zinc-800 border border-zinc-700 text-[#E70024] text-[10px] font-bold px-2 py-1 rounded-sm">{lang === 'RU' ? 'НЕТ' : 'NO'}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {customOutcomes.map((outcome, index) => (
                                <div key={index} className="flex gap-2">
                                    <input 
                                        value={outcome}
                                        onChange={(e) => handleOutcomeChange(index, e.target.value)}
                                        placeholder={lang === 'RU' ? `Вариант ${index + 1}` : `Option ${index + 1}`}
                                        className="flex h-9 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E70024]"
                                    />
                                    {customOutcomes.length > 2 && (
                                        <button 
                                            onClick={() => handleRemoveOutcome(index)}
                                            className="px-3 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:bg-red-900/20 hover:text-red-500 hover:border-red-900/50 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button 
                                onClick={handleAddOutcome}
                                className="w-full py-2 border border-dashed border-zinc-800 hover:border-zinc-600 rounded-md text-zinc-500 hover:text-[#E70024] text-xs uppercase font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={14} />
                                {lang === 'RU' ? 'Добавить вариант' : 'Add Option'}
                            </button>
                        </div>
                    )}

                    <Button fullWidth onClick={handleSubmit} disabled={!title || !endDate || (outcomeType === 'CUSTOM' && customOutcomes.some(o => !o))} variant="primary">
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