import React, { useEffect, useState } from 'react';
import { Search, Filter, Smartphone, Headphones, Plus, X } from 'lucide-react';
import './Inventory.css';
import { fetchProducts, insertProduct } from '../lib/api';
import type { Product } from '../lib/database.types';

const filters = ['Todos', 'Aparelhos', 'Acessórios'];

const emptyFormData = {
  name: '',
  category: 'Aparelhos' as 'Aparelhos' | 'Acessórios',
  brand: '',
  imei: '',
  batteryHealth: '',
  price: '',
  location: '',
  stock: '1',
  minStock: '0',
};

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyFormData);

  const loadProducts = () => {
    setLoading(true);
    fetchProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredInventory = products.filter(item => {
    if (activeFilter === 'Aparelhos' && item.category !== 'Aparelhos') return false;
    if (activeFilter === 'Acessórios' && item.category !== 'Acessórios') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) ||
             item.imei?.includes(q) ||
             item.code.toLowerCase().includes(q);
    }
    return true;
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await insertProduct({
        name: formData.name,
        category: formData.category,
        brand: formData.brand || null,
        location: formData.location || null,
        stock: Number(formData.stock) || 0,
        min_stock: Number(formData.minStock) || 0,
        price: Number(formData.price) || 0,
        imei: formData.category === 'Aparelhos' ? (formData.imei || null) : null,
        battery_health: formData.category === 'Aparelhos' ? (formData.batteryHealth || null) : null,
      });
      setIsModalOpen(false);
      setFormData(emptyFormData);
      loadProducts();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-col gap-6" style={{ width: '100%' }}>
      <div className="inventory-container">
        <div className="inventory-header">
          <div className="search-bar">
            <Search size={18} color="var(--text-muted, #9ca3af)" />
            <input
              type="text"
              placeholder="Buscar por produto, marca, modelo, imei..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="inventory-actions">
            <Filter size={20} color="var(--text-muted, #9ca3af)" />
            <div className="filter-chips">
              {filters.map(f => (
                <div
                  key={f}
                  className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
                  onClick={() => setActiveFilter(f)}
                >
                  {f}
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} />
              Novo Produto
            </button>
          </div>
        </div>

        <div className="inventory-table-card">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>PRODUTO & MODELO</th>
                <th>CATEGORIA</th>
                <th>VALOR UNITÁRIO</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum produto cadastrado ainda.
                  </td>
                </tr>
              )}
              {filteredInventory.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="product-cell">
                      <div className="product-image">
                        {item.category === 'Aparelhos' ? <Smartphone size={24} /> : <Headphones size={24} />}
                      </div>
                      <div className="product-info">
                        <span className="product-name">{item.name}</span>
                        <span className="product-meta">
                          {item.code} • Marca: {item.brand ?? '-'}
                        </span>
                        {(item.imei || item.battery_health) && (
                          <span className="product-meta" style={{ color: '#4f46e5', marginTop: '2px' }}>
                            {item.imei && `IMEI: ${item.imei}`}
                            {item.imei && item.battery_health && ' • '}
                            {item.battery_health && `Saúde da Bateria: ${item.battery_health}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`category-badge ${item.category === 'Aparelhos' ? 'aparelhos' : 'acessorios'}`}>
                      {item.category === 'Aparelhos' ? <Smartphone size={14} /> : <Headphones size={14} />}
                      {item.category}
                    </span>
                  </td>
                  <td>
                    <span className="price-cell">
                      R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cadastrar Produto/Aparelho</h2>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRegister}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Categoria</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value as 'Aparelhos' | 'Acessórios'})}
                  >
                    <option value="Aparelhos">Aparelhos</option>
                    <option value="Acessórios">Acessórios</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Produto / Modelo</label>
                  <input
                    type="text"
                    placeholder="Ex: iPhone 15 128GB"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Marca</label>
                  <input
                    type="text"
                    placeholder="Ex: Apple"
                    value={formData.brand}
                    onChange={(e) => setFormData({...formData, brand: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Localização</label>
                  <input
                    type="text"
                    placeholder="Ex: Vitrine Principal A1"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                  />
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Estoque Atual</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.stock}
                      onChange={(e) => setFormData({...formData, stock: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Estoque Mínimo</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.minStock}
                      onChange={(e) => setFormData({...formData, minStock: e.target.value})}
                      required
                    />
                  </div>
                </div>

                {formData.category === 'Aparelhos' && (
                  <>
                    <div className="form-group">
                      <label>IMEI / Serial</label>
                      <input
                        type="text"
                        placeholder="Ex: 358900000000000"
                        value={formData.imei}
                        onChange={(e) => setFormData({...formData, imei: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Saúde da Bateria (%)</label>
                      <input
                        type="text"
                        placeholder="Ex: 85%"
                        value={formData.batteryHealth}
                        onChange={(e) => setFormData({...formData, batteryHealth: e.target.value})}
                      />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Valor Unitário (R$)</label>
                  <input
                    type="number"
                    placeholder="Ex: 4999.00"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Cadastro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
